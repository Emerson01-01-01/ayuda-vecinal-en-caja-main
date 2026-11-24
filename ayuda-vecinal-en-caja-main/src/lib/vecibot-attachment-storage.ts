/** Originals remain on this device, never in a public bucket or in chat_messages. */
interface StoredFiles { key: string; storeId: string; messageId: string; files: File[] }
function openStorage(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("Este navegador no permite conservar adjuntos al recargar."));
    const request = indexedDB.open("vecibot-attachments", 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("files", { keyPath: "key" });
      store.createIndex("storeId", "storeId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Cierra otras pestañas de VeciBot para conservar adjuntos."));
  });
}
export async function saveMessageFiles(storeId: string, messageId: string, files: File[]) {
  if (!files.length) return;
  const db = await openStorage();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("files", "readwrite");
      transaction.objectStore("files").put({ key: `${storeId}:${messageId}`, storeId, messageId, files } satisfies StoredFiles);
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error("No hay espacio local para conservar el adjunto."));
    });
  } finally { db.close(); }
}
export async function loadMessageFiles(storeId: string, messageId: string): Promise<File[]> {
  const db = await openStorage();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("files").objectStore("files").get(`${storeId}:${messageId}`);
      request.onsuccess = () => resolve((request.result as StoredFiles | undefined)?.files || []);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
export async function clearMessageFiles(storeId: string) {
  const db = await openStorage();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("files", "readwrite");
      const cursor = transaction.objectStore("files").index("storeId").openCursor(IDBKeyRange.only(storeId));
      cursor.onsuccess = () => { if (cursor.result) { cursor.result.delete(); cursor.result.continue(); } };
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
