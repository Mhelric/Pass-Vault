import { decryptVaultRow, encryptVaultItem } from '../crypto/itemSerializer.js';
import { getOrInitDeviceKeyRecord, type VaultLocalDatabase } from '../db/dexie.js';
import type { EncryptedVaultRow, SyncQueueEntry } from '../types/vault.js';
import type { RemoteVaultAdapter } from './supabaseClient.js';

export interface DeltaSyncResult {
  pushedCount: number;
  pulledCount: number;
  conflictCount: number;
  lastSyncAt: string;
}

/** Persist an encrypted item locally and enqueue an offline-first upsert mutation. */
export async function queueLocalUpsert(
  db: VaultLocalDatabase,
  row: EncryptedVaultRow
): Promise<void> {
  await db.transaction('rw', db.items, db.syncQueue, async () => {
    const existingItem = await db.items.get(row.id);
    const existingQueue = await db.syncQueue.where('itemId').equals(row.id).first();

    const expectedVersion = existingQueue
      ? existingQueue.expectedVersion
      : existingItem
        ? existingItem.version
        : 0;

    await db.items.put(row);

    const queueEntry: SyncQueueEntry = {
      ...(existingQueue?.queueId !== undefined ? { queueId: existingQueue.queueId } : {}),
      itemId: row.id,
      userId: row.user_id,
      operation: 'upsert',
      expectedVersion,
      queuedAt: row.updated_at,
    };

    await db.syncQueue.put(queueEntry);
  });
}

/** Mark an item as soft-deleted locally and enqueue a tombstone sync mutation. */
export async function queueLocalSoftDelete(
  db: VaultLocalDatabase,
  itemId: string,
  userId: string,
  deletedAt: string = new Date().toISOString()
): Promise<EncryptedVaultRow | null> {
  return db.transaction('rw', db.items, db.syncQueue, async () => {
    const existing = await db.items.get(itemId);
    if (!existing || existing.user_id !== userId) {
      return null;
    }

    const existingQueue = await db.syncQueue.where('itemId').equals(itemId).first();
    const expectedVersion = existingQueue ? existingQueue.expectedVersion : existing.version;

    const tombstone: EncryptedVaultRow = {
      ...existing,
      deleted_at: deletedAt,
      updated_at: deletedAt,
    };

    await db.items.put(tombstone);

    await db.syncQueue.put({
      ...(existingQueue?.queueId !== undefined ? { queueId: existingQueue.queueId } : {}),
      itemId,
      userId,
      operation: 'delete',
      expectedVersion,
      queuedAt: deletedAt,
    });

    return tombstone;
  });
}

/**
 * Push queued offline mutations and pull remote changes since `lastSyncAt`.
 * Resolves optimistic concurrency conflicts without silently discarding edits.
 */
export async function runDeltaSync(params: {
  db: VaultLocalDatabase;
  remote: RemoteVaultAdapter;
  userId: string;
  vek?: Uint8Array | null;
}): Promise<DeltaSyncResult> {
  const { db, remote, userId, vek } = params;

  const queueEntries = await db.syncQueue.where('userId').equals(userId).sortBy('queuedAt');
  const pushedIds = new Set<string>();
  let pushedCount = 0;
  let conflictCount = 0;

  for (const entry of queueEntries) {
    if (entry.queueId !== undefined) {
      const stillQueued = await db.syncQueue.get(entry.queueId);
      if (!stillQueued) continue;
    }

    const localRow = await db.items.get(entry.itemId);
    if (!localRow) {
      if (entry.queueId !== undefined) {
        await db.syncQueue.delete(entry.queueId);
      }
      continue;
    }

    const remoteRow = await remote.getItemById(userId, entry.itemId);
    const isSamePayload = Boolean(
      remoteRow &&
        remoteRow.encrypted_payload === localRow.encrypted_payload &&
        remoteRow.iv === localRow.iv
    );
    const hasConflict = Boolean(
      remoteRow && remoteRow.version > entry.expectedVersion && !isSamePayload
    );

    if (hasConflict && remoteRow) {
      if (entry.operation === 'upsert') {
        if (!vek) {
          // Defer conflict duplication until vault is unlocked with VEK in RAM
          continue;
        }

        await db.items.put(remoteRow);

        const localDecrypted = await decryptVaultRow(localRow, vek);
        const nowIso = new Date().toISOString();
        const conflictId = globalThis.crypto.randomUUID();
        const conflictItem = {
          ...localDecrypted,
          id: conflictId,
          title: `${localDecrypted.title} (Sync Conflict)`,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        const encryptedConflict = await encryptVaultItem(conflictItem, userId, vek, 1, null);
        const savedConflict = await remote.upsertItem(encryptedConflict);
        await db.items.put(savedConflict);

        if (entry.queueId !== undefined) {
          await db.syncQueue.delete(entry.queueId);
        }

        pushedIds.add(remoteRow.id);
        pushedIds.add(savedConflict.id);
        conflictCount++;
        pushedCount++;
        continue;
      }

      // Remote edit wins over stale local delete
      await db.items.put(remoteRow);
      if (entry.queueId !== undefined) {
        await db.syncQueue.delete(entry.queueId);
      }
      pushedIds.add(remoteRow.id);
      conflictCount++;
      continue;
    }

    const nextVersion = remoteRow ? remoteRow.version + 1 : Math.max(1, localRow.version);
    const rowToPush: EncryptedVaultRow = {
      ...localRow,
      version: nextVersion,
    };

    const savedRemote = await remote.upsertItem(rowToPush);
    await db.items.put(savedRemote);

    if (entry.queueId !== undefined) {
      await db.syncQueue.delete(entry.queueId);
    }

    pushedIds.add(savedRemote.id);
    pushedCount++;
  }

  // Pull remote changes updated since lastSyncAt
  const deviceRecord = await getOrInitDeviceKeyRecord(db, userId);
  const remoteRows = await remote.pullItemsUpdatedSince(userId, deviceRecord.lastSyncAt);

  const remainingQueuedRows = await db.syncQueue.where('userId').equals(userId).toArray();
  const remainingQueuedIds = new Set(remainingQueuedRows.map((q) => q.itemId));

  let pulledCount = 0;
  let maxUpdatedAt = deviceRecord.lastSyncAt;

  for (const remoteRow of remoteRows) {
    if (!remainingQueuedIds.has(remoteRow.id)) {
      const localExisting = await db.items.get(remoteRow.id);
      const isNewOrNewer =
        !localExisting ||
        remoteRow.version > localExisting.version ||
        remoteRow.updated_at > localExisting.updated_at ||
        remoteRow.deleted_at !== localExisting.deleted_at;

      if (isNewOrNewer) {
        await db.items.put(remoteRow);
        if (!pushedIds.has(remoteRow.id)) {
          pulledCount++;
        }
      }
    }

    if (!maxUpdatedAt || remoteRow.updated_at > maxUpdatedAt) {
      maxUpdatedAt = remoteRow.updated_at;
    }
  }

  const nextSyncAt = maxUpdatedAt ?? new Date().toISOString();
  await db.deviceKeys.put({
    ...deviceRecord,
    lastSyncAt: nextSyncAt,
  });

  return {
    pushedCount,
    pulledCount,
    conflictCount,
    lastSyncAt: nextSyncAt,
  };
}
