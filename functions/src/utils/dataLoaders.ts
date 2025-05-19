import functions from 'firebase-functions';
import admin from 'firebase-admin';
import { Firestore, DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';

// Define interfaces for the expected data structures
// TODO: Refine these interfaces based on the actual structure of your Firestore documents
interface TaskData {
  [taskId: string]: unknown;
}
interface HideoutData {
  [moduleId: string]: unknown;
}

let cachedTaskData: TaskData | null | undefined = undefined;
let cachedHideoutData: HideoutData | null | undefined = undefined;

// Generic Firestore document loader with in-memory caching
async function loadAndCache<T>(
  cache: T | null | undefined,
  // eslint-disable-next-line no-unused-vars
  setCache: (unusedData: T | null) => void,
  collection: string,
  doc: string,
  errorLabel: string
): Promise<T | null> {
  const db: Firestore = admin.firestore();
  if (cache !== undefined) return cache;
  try {
    const ref: DocumentReference<T> = db.collection(collection).doc(doc) as DocumentReference<T>;
    const snapshot: DocumentSnapshot<T> = await ref.get();
    if (snapshot.exists) {
      setCache(snapshot.data() ?? null);
      return snapshot.data() ?? null;
    } else {
      functions.logger.error(`Error getting ${errorLabel}: Document does not exist`);
      setCache(null);
      return null;
    }
  } catch (error) {
    functions.logger.error(`Firestore error getting ${errorLabel}:`, { error });
    setCache(null);
    return null;
  }
}

export const getTaskData = async (): Promise<TaskData | null> =>
  loadAndCache(cachedTaskData, (d) => (cachedTaskData = d), 'tarkovdata', 'tasks', 'taskData');

export const getHideoutData = async (): Promise<HideoutData | null> =>
  loadAndCache(
    cachedHideoutData,
    (d) => (cachedHideoutData = d),
    'tarkovdata',
    'hideout',
    'hideoutData'
  );
