import admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler";
import {
  onCall,
  HttpsError,
  CallableRequest,
} from "firebase-functions/v2/https";
import { request, gql } from "graphql-request";
import UIDGenerator from "uid-generator";
import {
  DocumentReference,
  DocumentSnapshot,
  WriteBatch,
  Transaction,
  Firestore,
} from "firebase-admin/firestore";
// Import API and token functions using ESM - add .js extensions
// TypeScript requires .js extension here for NodeNext module resolution
import apiv2 from "./api/v2/index.js";
import { createToken } from "./api/token/create.js";
import { revokeToken } from "./api/token/revoke.js";
// console.log("Firebase Functions Environment:", process.env.NODE_ENV);
// console.log('Firebase Admin SDK Version:', admin.SDK_VERSION); // Use admin.SDK_VERSION if available/needed
// console.log('Firebase Functions Version:', functions.SDK_VERSION); // Use functions.SDK_VERSION if available/needed
admin.initializeApp();
// Export the v2 API using ESM
export default apiv2;
// Export the token management functions using ESM
export { createToken, revokeToken };
// --- Team Management Logic Functions (for testing) ---
// Define a type for System documents
interface SystemDocData {
  team?: string | null;
  teamMax?: number;
  lastLeftTeam?: admin.firestore.Timestamp;
  // Add other fields from system documents if known
}
// Define a type for Team documents
interface TeamDocData {
  owner?: string;
  password?: string;
  maximumMembers?: number;
  members?: string[];
  createdAt?: admin.firestore.Timestamp;
  // Add other fields from team documents if known
}
async function _leaveTeamLogic(
  request: CallableRequest<any>,
): Promise<{ left: boolean }> {
  const db: Firestore = admin.firestore();
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const userUid: string = request.auth.uid;
  try {
    let originalTeam: string | null = null; // Define outside transaction scope
    await db.runTransaction(async (transaction: Transaction) => {
      const systemRef: DocumentReference<SystemDocData> = db
        .collection("system")
        .doc(userUid) as DocumentReference<SystemDocData>;
      const systemDoc: DocumentSnapshot<SystemDocData> =
        await transaction.get(systemRef);
      const systemData = systemDoc?.data();
      originalTeam = systemData?.team ?? null; // Assign inside transaction
      if (systemData?.team) {
        const teamRef: DocumentReference<TeamDocData> = db
          .collection("team")
          .doc(systemData.team) as DocumentReference<TeamDocData>;
        const teamDoc: DocumentSnapshot<TeamDocData> =
          await transaction.get(teamRef);
        const teamData = teamDoc?.data();
        if (teamData?.owner === userUid) {
          // Disband team if owner leaves
          if (teamData?.members) {
            teamData.members.forEach((member: string) => {
              logger.log("Removing team from member", {
                member,
                team: originalTeam,
              });
              transaction.set(
                db.collection("system").doc(member),
                {
                  team: null,
                  lastLeftTeam: admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true },
              );
            });
          }
          transaction.delete(teamRef);
        } else {
          // Leave team if member
          transaction.set(
            teamRef,
            { members: admin.firestore.FieldValue.arrayRemove(userUid) },
            { merge: true },
          );
          transaction.set(
            systemRef,
            {
              team: null,
              lastLeftTeam: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
      } else {
        throw new HttpsError("failed-precondition", "User is not in a team");
      }
      logger.log("Left team", {
        user: userUid,
        team: originalTeam,
      });
    });
    logger.log("Finished leave team", { user: userUid });
    return { left: true };
  } catch (e: any) {
    logger.error("Failed to leave team", {
      owner: userUid,
      error: e,
    });
    if (e instanceof HttpsError) {
      throw e;
    }
    throw new HttpsError("internal", "Error during team leave", e.message);
  }
}
// Define an interface for the expected data structure
interface JoinTeamData {
  id: string;
  password: string;
}
async function _joinTeamLogic(
  request: CallableRequest<JoinTeamData>,
): Promise<{ joined: boolean }> {
  const db: Firestore = admin.firestore();
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const userUid: string = request.auth.uid;
  const data = request.data;
  try {
    await db.runTransaction(async (transaction: Transaction) => {
      const systemRef: DocumentReference<SystemDocData> = db
        .collection("system")
        .doc(userUid) as DocumentReference<SystemDocData>;
      const systemDoc: DocumentSnapshot<SystemDocData> =
        await transaction.get(systemRef);
      const systemData = systemDoc?.data();
      if (systemData?.team) {
        throw new HttpsError(
          "failed-precondition",
          "User is already in a team",
        );
      }
      if (!data.id || !data.password) {
        throw new HttpsError(
          "invalid-argument",
          "Team ID and password required.",
        );
      }
      const teamRef: DocumentReference<TeamDocData> = db
        .collection("team")
        .doc(data.id) as DocumentReference<TeamDocData>;
      const teamDoc: DocumentSnapshot<TeamDocData> =
        await transaction.get(teamRef);
      const teamData = teamDoc?.data();
      if (!teamDoc?.exists) {
        throw new HttpsError("not-found", "Team doesn't exist");
      }
      if (teamData?.password !== data.password) {
        throw new HttpsError("unauthenticated", "Wrong password");
      }
      if (
        (teamData?.members?.length ?? 0) >= (teamData?.maximumMembers ?? 10)
      ) {
        throw new HttpsError("resource-exhausted", "Team is full");
      }
      transaction.set(
        teamRef,
        { members: admin.firestore.FieldValue.arrayUnion(userUid) },
        { merge: true },
      );
      transaction.set(systemRef, { team: data.id }, { merge: true });
    });
    logger.log("Joined team", {
      user: userUid,
      team: data.id,
    });
    return { joined: true };
  } catch (e: any) {
    logger.error("Failed to join team", {
      user: userUid,
      team: data.id,
      error: e,
    });
    if (e instanceof HttpsError) {
      throw e;
    }
    throw new HttpsError("internal", "Error during team join", e.message);
  }
}

// Define interface for CreateTeamData
interface CreateTeamData {
  password?: string; // Optional password
  maximumMembers?: number; // Optional max members
}

async function _createTeamLogic(
  request: CallableRequest<CreateTeamData>,
): Promise<{ team: string }> {
  const db: Firestore = admin.firestore();
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const userUid: string = request.auth.uid;
  const data = request.data;
  try {
    let createdTeam = "";
    await db.runTransaction(async (transaction: Transaction) => {
      try {
        logger.log("[createTeam] Transaction start", { userUid });
        const systemRef: DocumentReference<SystemDocData> = db
          .collection("system")
          .doc(userUid) as DocumentReference<SystemDocData>;
        logger.log("[createTeam] systemRef", { path: systemRef.path });
        const systemDoc: DocumentSnapshot<SystemDocData> =
          await transaction.get(systemRef);
        const systemData = systemDoc?.data();
        logger.log("[createTeam] systemData", { systemData });
        if (systemData?.team) {
          logger.log("[createTeam] User already in team", {
            team: systemData.team,
          });
          throw new HttpsError(
            "failed-precondition",
            "User is already in a team.",
          );
        }
        if (systemData?.lastLeftTeam) {
          const now = admin.firestore.Timestamp.now();
          const fiveMinutesAgo = admin.firestore.Timestamp.fromMillis(
            now.toMillis() - 5 * 60 * 1000,
          );
          logger.log("[createTeam] lastLeftTeam", {
            lastLeftTeam: systemData.lastLeftTeam.toMillis(),
            now: now.toMillis(),
            fiveMinutesAgo: fiveMinutesAgo.toMillis(),
          });
          if (systemData.lastLeftTeam > fiveMinutesAgo) {
            throw new HttpsError(
              "failed-precondition",
              "You must wait 5 minutes after leaving a team to create a new one.",
            );
          }
        }
        logger.log("[createTeam] Creating UIDGenerator");
        const uidgen = new UIDGenerator(32); // Generate a 32-bit ID (valid multiple of 8)
        const teamId = await uidgen.generate();
        logger.log("[createTeam] Generated teamId", { teamId });

        let teamPassword = data.password;
        logger.log(
          "[createTeam] DEBUG PASVVOORD: Initial teamPassword from data (data.password):",
        );
        logger.log(data.password === undefined ? "undefined" : data.password);

        if (!teamPassword) {
          logger.log(
            "[createTeam] DEBUG PASVVOORD: No client password, generating one...",
          );
          try {
            const passGen = new UIDGenerator(48, UIDGenerator.BASE62); // Generate from 48 bits of randomness, encoded in Base62 (approx 8 chars)
            const generatedPass = await passGen.generate();
            logger.log("[createTeam] DEBUG PASVVOORD: Raw generatedPass:");
            logger.log(
              generatedPass === undefined ? "undefined" : generatedPass,
            );

            if (generatedPass && generatedPass.length >= 4) {
              teamPassword = generatedPass;
              logger.log(
                "[createTeam] DEBUG PASVVOORD: Using generated password (masked): ****",
              );
            } else {
              logger.warn(
                "[createTeam] DEBUG PASVVOORD: Generated password was short or falsy. Raw:",
                generatedPass,
                "Using fallback: DEBUG_PASS_123",
              );
              teamPassword = "DEBUG_PASS_123";
            }
          } catch (genError) {
            logger.error(
              "[createTeam] DEBUG PASVVOORD: Error during password generation:",
              genError,
            );
            teamPassword = "ERROR_PASS_456"; // Fallback on error
          }
        } else {
          logger.log(
            "[createTeam] DEBUG PASVVOORD: Using client-provided password (masked): ****",
          );
        }

        logger.log(
          "[createTeam] DEBUG PASVVOORD: Final teamPassword before set (masked):",
          teamPassword ? "****" : "(IT IS FALSY)",
          "Actual value for Firestore:",
          teamPassword,
        );

        createdTeam = teamId;
        const teamRef = db.collection("team").doc(teamId);
        logger.log("[createTeam] teamRef", { path: teamRef.path });

        transaction.set(teamRef, {
          owner: userUid,
          password: teamPassword,
          maximumMembers: data.maximumMembers || 10,
          members: [userUid],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        logger.log("[createTeam] Set team document");
        transaction.set(systemRef, { team: teamId }, { merge: true });
        logger.log("[createTeam] Set system document");
      } catch (err) {
        logger.error("[createTeam] Error inside transaction", {
          error: err,
          errorString: JSON.stringify(err),
          errorMessage:
            typeof err === "object" && err !== null && "message" in err
              ? (err as any).message
              : (err?.toString?.() ?? String(err)),
          errorStack:
            typeof err === "object" && err !== null && "stack" in err
              ? (err as any).stack
              : undefined,
        });
        throw err;
      }
    });
    logger.log("Created team", {
      owner: userUid,
      team: createdTeam,
      maximumMembers: data.maximumMembers || 10,
    });
    return { team: createdTeam };
  } catch (e: any) {
    logger.error("Failed to create team", {
      owner: userUid,
      error: e,
      errorString: JSON.stringify(e),
      errorMessage:
        typeof e === "object" && e !== null && "message" in e
          ? (e as any).message
          : (e?.toString?.() ?? String(e)),
      errorStack:
        typeof e === "object" && e !== null && "stack" in e
          ? (e as any).stack
          : undefined,
    });
    if (e instanceof HttpsError) {
      throw e;
    }
    throw new HttpsError(
      "internal",
      "Error during team creation",
      typeof e === "object" && e !== null && "message" in e
        ? (e as any).message
        : (e?.toString?.() ?? String(e)),
    );
  }
}

// Define interface for KickTeamMemberData
interface KickTeamMemberData {
  kicked: string;
}

async function _kickTeamMemberLogic(
  request: CallableRequest<KickTeamMemberData>,
): Promise<{ kicked: boolean }> {
  const db: Firestore = admin.firestore();
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const userUid: string = request.auth.uid;
  const data = request.data;
  if (!data.kicked) {
    throw new HttpsError("invalid-argument", "Kicked user ID required.");
  }
  if (data.kicked === userUid) {
    throw new HttpsError("invalid-argument", "You can't kick yourself.");
  }
  try {
    await db.runTransaction(async (transaction: Transaction) => {
      const systemRef: DocumentReference<SystemDocData> = db
        .collection("system")
        .doc(userUid) as DocumentReference<SystemDocData>;
      const systemDoc: DocumentSnapshot<SystemDocData> =
        await transaction.get(systemRef);
      const systemData = systemDoc?.data();
      const teamId = systemData?.team;
      if (!teamId) {
        throw new HttpsError("failed-precondition", "User is not in a team.");
      }
      const teamRef: DocumentReference<TeamDocData> = db
        .collection("team")
        .doc(teamId) as DocumentReference<TeamDocData>;
      const teamDoc: DocumentSnapshot<TeamDocData> =
        await transaction.get(teamRef);
      const teamData = teamDoc?.data();
      if (teamData?.owner !== userUid) {
        throw new HttpsError(
          "permission-denied",
          "Only the team owner can kick members.",
        );
      }
      if (!teamData?.members?.includes(data.kicked)) {
        throw new HttpsError("not-found", "User not found in team.");
      }
      // Kick the member
      transaction.set(
        teamRef,
        { members: admin.firestore.FieldValue.arrayRemove(data.kicked) },
        { merge: true },
      );
      // Update the kicked member's system document
      const kickedUserSystemRef: DocumentReference<SystemDocData> = db
        .collection("system")
        .doc(data.kicked) as DocumentReference<SystemDocData>;
      transaction.set(
        kickedUserSystemRef,
        {
          team: null,
          lastLeftTeam: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
    logger.log("Kicked member", {
      owner: userUid,
      kicked: data.kicked,
    });
    return { kicked: true };
  } catch (e: any) {
    logger.error("Failed to kick team member", {
      owner: userUid,
      kicked: data.kicked,
      error: e,
    });
    if (e instanceof HttpsError) {
      throw e;
    }
    throw new HttpsError("internal", "Error kicking member", e.message);
  }
}
// Wrap the logic functions in onCall handlers
export const createTeam = onCall<CreateTeamData>(
  async (request: CallableRequest<CreateTeamData>) => {
    console.log(
      "Firebase Functions Environment (inside handler):",
      process.env.NODE_ENV,
    );
    return _createTeamLogic(request);
  },
);
export const joinTeam = onCall(_joinTeamLogic);
export const leaveTeam = onCall(_leaveTeamLogic);
export const kickTeamMember = onCall(_kickTeamMemberLogic);
// -- GraphQL Data Retrieval (Example for Tarkov data) --
// Interface for Tarkov items from GraphQL
interface TarkovItem {
  id: string;
  // Add other known properties from the GraphQL query
  [key: string]: any; // Allow other properties
}
// Interface for the expected GraphQL response structure
interface TarkovDataResponse {
  items: TarkovItem[];
}
// Function to retrieve data from Tarkov API
async function retrieveTarkovdata(): Promise<TarkovDataResponse | undefined> {
  const query = gql`
    {
      items {
        id
        name
        shortName
        basePrice
        updated
        width
        height
        iconLink
        wikiLink
        imageLink
        types
        avg24hPrice
        traderPrices {
          price
          trader {
            name
          }
        }
        buyFor {
          price
          currency
          requirements {
            type
            value
          }
          source
        }
        sellFor {
          price
          currency
          requirements {
            type
            value
          }
          source
        }
      }
    }
  `;
  try {
    const data: TarkovDataResponse = await request(
      "https://api.tarkov.dev/graphql",
      query,
    );
    return data;
  } catch (e: any) {
    logger.error("Failed to retrieve data from Tarkov API:", e.message);
    return undefined; // Return undefined or handle error as needed
  }
}
// Function to save data to Firestore
async function saveTarkovData(data: TarkovDataResponse | undefined) {
  if (!data || !data.items) {
    logger.error("No data received from Tarkov API to save.");
    return;
  }
  const db: Firestore = admin.firestore();
  const batch: WriteBatch = db.batch();
  const itemsCollection = db.collection("items"); // Reference to the 'items' collection
  data.items.forEach((item: TarkovItem) => {
    // Sanitize the ID for Firestore document path compatibility
    const docId = item.id.replace(/[/\\*?[\]]/g, "_");
    const docRef = itemsCollection.doc(docId);
    batch.set(docRef, item);
  });
  try {
    await batch.commit();
    logger.log(`Successfully saved ${data.items.length} items to Firestore.`);
  } catch (e: any) {
    logger.error("Failed to save Tarkov data to Firestore:", e.message);
  }
}
// Scheduled function to fetch and save data daily
export const scheduledTarkovDataFetch = onSchedule(
  "every day 00:00",
  async (event: ScheduledEvent) => {
    logger.log("Running scheduled Tarkov data fetch...");
    const data = await retrieveTarkovdata();
    await saveTarkovData(data);
  },
);
// Example HTTP function (adjust if needed)
// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", { structuredData: true });
//   response.send("Hello from Firebase!");
// });
