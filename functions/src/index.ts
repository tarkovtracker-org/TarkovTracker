import admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler";
import {
  HttpsError,
  CallableRequest,
  FunctionsErrorCode,
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
import { apiv2Default as _apiv2Default } from "./api/v2/index.js";
import { createToken } from "./api/token/create.js";
import { revokeToken } from "./api/token/revoke.js";
import cors from "cors";
import * as functions from "firebase-functions";
admin.initializeApp();
export const apiv2Default = _apiv2Default;
export { createToken, revokeToken };

interface SystemDocData {
  team?: string | null;
  teamMax?: number;
  lastLeftTeam?: admin.firestore.Timestamp;
}
interface TeamDocData {
  owner?: string;
  password?: string;
  maximumMembers?: number;
  members?: string[];
  createdAt?: admin.firestore.Timestamp;
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
    let originalTeam: string | null = null;
    await db.runTransaction(async (transaction: Transaction) => {
      const systemRef: DocumentReference<SystemDocData> = db
        .collection("system")
        .doc(userUid) as DocumentReference<SystemDocData>;
      const systemDoc: DocumentSnapshot<SystemDocData> =
        await transaction.get(systemRef);
      const systemData = systemDoc?.data();
      originalTeam = systemData?.team ?? null;
      if (systemData?.team) {
        const teamRef: DocumentReference<TeamDocData> = db
          .collection("team")
          .doc(systemData.team) as DocumentReference<TeamDocData>;
        const teamDoc: DocumentSnapshot<TeamDocData> =
          await transaction.get(teamRef);
        const teamData = teamDoc?.data();
        if (teamData?.owner === userUid) {
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

interface CreateTeamData {
  password?: string;
  maximumMembers?: number;
}
async function _createTeamLogic(
  request: CallableRequest<CreateTeamData>,
): Promise<{ team: string; password?: string }> {
  const db: Firestore = admin.firestore();
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const userUid: string = request.auth.uid;
  const data = request.data;
  try {
    let createdTeam = "";
    let finalTeamPassword = ""; // Variable to store the password
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
        const uidgen = new UIDGenerator(32);
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
            const passGen = new UIDGenerator(48, UIDGenerator.BASE62);
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
            teamPassword = "ERROR_PASS_456";
          }
        } else {
          logger.log(
            "[createTeam] DEBUG PASVVOORD: Using client-provided password (masked): ****",
          );
        }
        finalTeamPassword = teamPassword; // Store the password
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
    return { team: createdTeam, password: finalTeamPassword }; // Return both teamId and password
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
      transaction.set(
        teamRef,
        { members: admin.firestore.FieldValue.arrayRemove(data.kicked) },
        { merge: true },
      );
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

const corsHandler = cors({
  origin: ["https://tarkov-tracker-dev.web.app", "https://tarkovtracker.org"],
});

// Helper function to map HttpsError codes to HTTP status codes
function getStatusFromHttpsErrorCode(code: FunctionsErrorCode): number {
  switch (code) {
    case "ok":
      return 200;
    case "cancelled":
      return 499; // Typically 499 Client Closed Request
    case "unknown":
      return 500;
    case "invalid-argument":
      return 400;
    case "deadline-exceeded":
      return 504;
    case "not-found":
      return 404;
    case "already-exists":
      return 409;
    case "permission-denied":
      return 403;
    case "resource-exhausted":
      return 429;
    case "failed-precondition":
      return 400;
    case "aborted":
      return 409;
    case "out-of-range":
      return 400;
    case "unauthenticated":
      return 401;
    case "internal":
      return 500;
    case "unavailable":
      return 503;
    case "data-loss":
      return 500;
    default:
      logger.warn("Unknown HttpsError code received:", code);
      return 500;
  }
}

export const createTeam = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      const authHeader = req.headers.authorization || "";
      const match = authHeader.match(/^Bearer (.+)$/);
      if (!match) {
        res
          .status(401)
          .json({ error: "Missing or invalid Authorization header" });
        return;
      }
      const idToken = match[1];
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (err: any) {
        logger.warn("Token verification failed for createTeam", {
          error: err,
          tokenUsed: idToken ? idToken.substring(0, 10) + "..." : "null",
        });
        res
          .status(401)
          .json({ error: err.message || "Invalid or expired token" });
        return;
      }
      const userUid = decodedToken.uid;
      const data = req.body;
      // Mimic CallableRequest structure
      const request = {
        auth: { uid: userUid, token: decodedToken },
        data,
        rawRequest: req,
        acceptsStreaming: false,
      };
      try {
        const result = await _createTeamLogic(request);
        res.status(200).json({ data: result });
      } catch (e: any) {
        let messageToSend = "Error processing team creation.";
        let httpStatus = 500; // Default to 500

        if (e instanceof HttpsError) {
          httpStatus = getStatusFromHttpsErrorCode(
            e.code as FunctionsErrorCode,
          );
          if (
            e.code === "internal" &&
            e.message === "Error during team creation" &&
            e.details
          ) {
            messageToSend =
              typeof e.details === "string"
                ? e.details.substring(0, 500)
                : String(e.details).substring(0, 500);
          } else {
            messageToSend = e.message || messageToSend;
          }
        } else if (e && e.message) {
          messageToSend = String(e.message).substring(0, 500);
        } else if (typeof e === "string") {
          messageToSend = e.substring(0, 500);
        }
        logger.error("Error from _createTeamLogic in createTeam handler", {
          uid: userUid,
          originalError: e,
          errorCode: e?.code,
          errorMessage: e?.message,
          errorDetails: e?.details,
          messageSent: messageToSend,
          httpStatusSet: httpStatus,
        });
        res.status(httpStatus).json({ error: messageToSend });
      }
    } catch (e: any) {
      // Outer catch for auth errors or other setup issues
      let messageToSend = "Server error during team creation request."; // Default message
      if (e && e.message) {
        // If the caught error is the one from token verification (already sent with 401), avoid double logging/responding
        if (res.headersSent) return;
        messageToSend = String(e.message).substring(0, 500);
      } else if (typeof e === "string") {
        messageToSend = e.substring(0, 500);
      }
      logger.error("Outer error in createTeam request handler", {
        originalError: e, // Log the full error object
        errorMessage: e?.message,
        messageSent: messageToSend,
      });
      // Ensure a response is sent if not already
      if (!res.headersSent) {
        res.status(500).json({ error: messageToSend });
      }
    }
  });
});

export const joinTeam = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }
    try {
      const authHeader = req.headers.authorization || "";
      const match = authHeader.match(/^Bearer (.+)$/);
      if (!match) {
        res
          .status(401)
          .json({ error: "Missing or invalid Authorization header" });
        return;
      }
      const idToken = match[1];
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (err) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }
      const userUid = decodedToken.uid;
      const data = req.body;
      // Mimic CallableRequest structure
      const request = {
        auth: { uid: userUid, token: decodedToken },
        data,
        rawRequest: req,
        acceptsStreaming: false,
      };
      try {
        const result = await _joinTeamLogic(request);
        res.status(200).json(result);
      } catch (e: any) {
        let messageToSend = "Error processing join team request.";
        let httpStatus = 500;

        if (e instanceof HttpsError) {
          httpStatus = getStatusFromHttpsErrorCode(
            e.code as FunctionsErrorCode,
          );
          messageToSend = e.message || messageToSend;
        } else if (e && e.message) {
          messageToSend = String(e.message).substring(0, 500);
        } else if (typeof e === "string") {
          messageToSend = e.substring(0, 500);
        }
        logger.error("Error from _joinTeamLogic in joinTeam handler", {
          uid: userUid, // Ensure userUid is defined in this scope or remove if not needed for this log
          originalError: e,
          messageSent: messageToSend,
          httpStatusSet: httpStatus,
        });
        res.status(httpStatus).json({ error: messageToSend });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });
});

export const leaveTeam = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }
    try {
      const authHeader = req.headers.authorization || "";
      const match = authHeader.match(/^Bearer (.+)$/);
      if (!match) {
        res
          .status(401)
          .json({ error: "Missing or invalid Authorization header" });
        return;
      }
      const idToken = match[1];
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (err) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }
      const userUid = decodedToken.uid;
      const data = req.body;
      // Mimic CallableRequest structure
      const request = {
        auth: { uid: userUid, token: decodedToken },
        data,
        rawRequest: req,
        acceptsStreaming: false,
      };
      try {
        await _leaveTeamLogic(request);
        res.status(200).json({ data: { left: true } });
      } catch (e: any) {
        let messageToSend = "Error processing leave team request.";
        let httpStatus = 500;
        if (e instanceof HttpsError) {
          httpStatus = getStatusFromHttpsErrorCode(
            e.code as FunctionsErrorCode,
          );
          messageToSend = e.message || messageToSend;
        } else if (e && e.message) {
          messageToSend = String(e.message).substring(0, 500);
        } else if (typeof e === "string") {
          messageToSend = e.substring(0, 500);
        }
        logger.error("Error from _leaveTeamLogic in leaveTeam handler", {
          uid: userUid, // Ensure userUid is defined
          originalError: e,
          messageSent: messageToSend,
          httpStatusSet: httpStatus,
        });
        res.status(httpStatus).json({ error: messageToSend });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });
});

export const kickTeamMember = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }
    try {
      const authHeader = req.headers.authorization || "";
      const match = authHeader.match(/^Bearer (.+)$/);
      if (!match) {
        res
          .status(401)
          .json({ error: "Missing or invalid Authorization header" });
        return;
      }
      const idToken = match[1];
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (err) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }
      const userUid = decodedToken.uid;
      const data = req.body;
      // Mimic CallableRequest structure
      const request = {
        auth: { uid: userUid, token: decodedToken },
        data,
        rawRequest: req,
        acceptsStreaming: false,
      };
      try {
        const result = await _kickTeamMemberLogic(request);
        res.status(200).json(result);
      } catch (e: any) {
        let messageToSend = "Error processing kick member request.";
        let httpStatus = 500;
        if (e instanceof HttpsError) {
          httpStatus = getStatusFromHttpsErrorCode(
            e.code as FunctionsErrorCode,
          );
          messageToSend = e.message || messageToSend;
        } else if (e && e.message) {
          messageToSend = String(e.message).substring(0, 500);
        } else if (typeof e === "string") {
          messageToSend = e.substring(0, 500);
        }
        logger.error(
          "Error from _kickTeamMemberLogic in kickTeamMember handler",
          {
            uid: userUid, // Ensure userUid is defined
            originalError: e,
            messageSent: messageToSend,
            httpStatusSet: httpStatus,
          },
        );
        res.status(httpStatus).json({ error: messageToSend });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });
});

interface TarkovItem {
  id: string;
  [key: string]: any;
}
interface TarkovDataResponse {
  items: TarkovItem[];
}
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
    return undefined;
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
  async (_event: ScheduledEvent) => {
    logger.log("Running scheduled Tarkov data fetch...");
    const data = await retrieveTarkovdata();
    await saveTarkovData(data);
  },
);
