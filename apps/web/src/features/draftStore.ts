export type DraftAttachment = { name: string; type: string; size: number; blob: Blob };
export type TechnicianDraft = {
  id: string;
  date: string;
  observation: string;
  equipment: string;
  subsystem: string;
  symptom: string;
  cause: string;
  action: string;
  parts: string;
  safety: string;
  mode: string;
  duration: number;
  audio?: Blob;
  audioType?: string;
  attachments: DraftAttachment[];
  syncStatus: 'local';
};

const DB_NAME = 'workshop-note';
const STORE = 'drafts';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getDrafts(): Promise<TechnicianDraft[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => { resolve((request.result as TechnicianDraft[]).sort((a, b) => b.date.localeCompare(a.date))); db.close(); };
    request.onerror = () => { reject(request.error); db.close(); };
  });
}

export async function saveDraft(draft: TechnicianDraft): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(draft);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
}
