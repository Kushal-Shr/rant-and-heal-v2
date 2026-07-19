import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { JournalEntry } from "../types/database";

const USER_COLLECTION = "users";
const JOURNALS_COLLECTION = "journals";

export type CreateJournalEntryInput = {
  title: string;
  body: string;
  moodTag?: string;
};

export type UpdateJournalEntryInput = CreateJournalEntryInput;

function journalsCollection(uid: string) {
  return collection(db, USER_COLLECTION, uid, JOURNALS_COLLECTION);
}

function journalDocument(uid: string, entryId: string) {
  return doc(db, USER_COLLECTION, uid, JOURNALS_COLLECTION, entryId);
}

export async function createJournalEntry(
  uid: string,
  input: CreateJournalEntryInput
): Promise<string> {
  const docRef = await addDoc(journalsCollection(uid), {
    title: input.title.trim(),
    body: input.body.trim(),
    moodTag: input.moodTag?.trim() || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function listJournalEntries(uid: string): Promise<JournalEntry[]> {
  const entriesQuery = query(journalsCollection(uid), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(entriesQuery);

  return snapshot.docs.map((entryDoc) => ({
    id: entryDoc.id,
    ...(entryDoc.data() as Omit<JournalEntry, "id">),
  }));
}

export async function updateJournalEntry(
  uid: string,
  entryId: string,
  input: UpdateJournalEntryInput
): Promise<void> {
  await updateDoc(journalDocument(uid, entryId), {
    title: input.title.trim(),
    body: input.body.trim(),
    moodTag: input.moodTag?.trim() || "",
    updatedAt: serverTimestamp(),
  });
}

export async function deleteJournalEntry(uid: string, entryId: string): Promise<void> {
  await deleteDoc(journalDocument(uid, entryId));
}
