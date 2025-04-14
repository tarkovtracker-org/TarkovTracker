import admin from "firebase-admin"; // Use import
import functions from "firebase-functions";
import { logger } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler"; // Keep v2 for scheduler
import { request, gql } from "graphql-request"; // Use import
import UIDGenerator from "uid-generator"; // Use import
import fetch from "node-fetch"; // Assuming node-fetch is needed, use import

// Import API and token functions using ESM
import apiv2 from "./api/v2/index.js"; // Default import
import { createToken } from "./api/token/create.js"; // Named import
import { revokeToken } from "./api/token/revoke.js"; // Named import

console.log("Firebase Functions Environment:", process.env.NODE_ENV);
// console.log('Firebase Admin SDK Version:', admin.SDK_VERSION); // Use admin.SDK_VERSION if available/needed
// console.log('Firebase Functions Version:', functions.SDK_VERSION); // Use functions.SDK_VERSION if available/needed

admin.initializeApp();

// Export the v2 API using ESM
export default apiv2;

// Export the token management functions using ESM
export { createToken, revokeToken };

// --- Team Management Logic Functions (for testing) ---

async function _leaveTeamLogic(data, context) {
  const db = admin.firestore();
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Authentication required.",
    );
  }
  try {
    let originalTeam = null; // Define outside transaction scope
    await db.runTransaction(async (transaction) => {
      const systemRef = db.collection("system").doc(context.auth.uid);
      const systemDoc = await transaction.get(systemRef);
      originalTeam = systemDoc?.data()?.team; // Assign inside transaction

      if (systemDoc?.data()?.team) {
        const teamRef = db.collection("team").doc(systemDoc.data().team);
        const teamDoc = await transaction.get(teamRef);
        if (teamDoc?.data()?.owner == context.auth.uid) {
          // Disband team
          teamDoc.data()?.members.forEach((member) => {
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
          transaction.delete(teamRef);
        } else {
          // Leave team
          transaction.set(
            teamRef,
            {
              members: admin.firestore.FieldValue.arrayRemove(context.auth.uid),
            },
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
        throw new functions.https.HttpsError(
          "failed-precondition",
          "User is not in a team",
        );
      }
      logger.log("Left team", {
        user: context.auth.uid,
        team: originalTeam,
      });
    });
    logger.log("Finished leave team", { user: context.auth.uid });
    return { left: true };
  } catch (e) {
    logger.error("Failed to leave team", {
      owner: context.auth.uid,
      error: e,
    });
    if (e instanceof functions.https.HttpsError) {
      throw e;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Error during team leave",
      e.message,
    );
  }
}

async function _joinTeamLogic(data, context) {
  const db = admin.firestore();
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Authentication required.",
    );
  }
  try {
    await db.runTransaction(async (transaction) => {
      const systemRef = db.collection("system").doc(context.auth.uid);
      const systemDoc = await transaction.get(systemRef);

      if (systemDoc?.data()?.team) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "User is already in a team",
        );
      }
      if (!data.id || !data.password) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Team ID and password required.",
        );
      }

      const teamRef = db.collection("team").doc(data.id);
      const teamDoc = await transaction.get(teamRef);

      if (!teamDoc?.exists) {
        throw new functions.https.HttpsError("not-found", "Team doesn't exist");
      }
      if (teamDoc?.data()?.password != data.password) {
        throw new functions.https.HttpsError(
          "unauthenticated",
          "Wrong password",
        );
      }
      if (
        teamDoc?.data()?.members.length >=
        (teamDoc?.data()?.maximumMembers || 10)
      ) {
        throw new functions.https.HttpsError(
          "resource-exhausted",
          "Team is full",
        );
      }

      transaction.set(
        teamRef,
        { members: admin.firestore.FieldValue.arrayUnion(context.auth.uid) },
        { merge: true },
      );
      transaction.set(systemRef, { team: data.id }, { merge: true });
    });
    logger.log("Joined team", {
      user: context.auth.uid,
      team: data.id,
    });
    return { joined: true };
  } catch (e) {
    logger.error("Failed to join team", {
      user: context.auth.uid,
      team: data.id,
      error: e,
    });
    if (e instanceof functions.https.HttpsError) {
      throw e;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Error during team join",
      e.message,
    );
  }
}

async function _createTeamLogic(data, context) {
  const db = admin.firestore();
  logger.log("Auth context in _createTeamLogic:", context.auth);
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Authentication required.",
    );
  }
  const systemRef = db.collection("system").doc(context.auth.uid);
  const myTeamRef = db.collection("team").doc(context.auth.uid);

  logger.log("Creating team", { owner: context.auth.uid });

  try {
    await db.runTransaction(async (transaction) => {
      const systemDoc = await transaction.get(systemRef);

      if (systemDoc?.data()?.team) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "User already in a team",
        );
      }

      const myTeamDoc = await transaction.get(myTeamRef);
      if (myTeamDoc.exists) {
        throw new functions.https.HttpsError(
          "already-exists",
          "Team already exists",
        );
      }

      const uidgen = new UIDGenerator(64);
      const password = await uidgen.generate();

      transaction.set(myTeamRef, {
        owner: context.auth.uid,
        password: password,
        maximumMembers: systemDoc.data()?.teamMax || 10,
        members: [context.auth.uid],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.set(systemRef, { team: context.auth.uid }, { merge: true });
    });
    logger.info("Created team", { owner: context.auth.uid });
    return { team: context.auth.uid };
  } catch (e) {
    logger.error("Failed to create team", {
      owner: context.auth.uid,
      error: e,
    });
    if (e instanceof functions.https.HttpsError) {
      throw e;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Error during team creation",
      e.message,
    );
  }
}

async function _kickTeamMemberLogic(data, context) {
  const db = admin.firestore();
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Authentication required.",
    );
  }
  if (!data.kicked) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Kicked user ID required.",
    );
  }

  try {
    await db.runTransaction(async (transaction) => {
      const teamRef = db.collection("team").doc(context.auth.uid); // Team ID is owner's UID
      const teamDoc = await transaction.get(teamRef);
      const kickedRef = db.collection("system").doc(data.kicked);
      const kickedDoc = await transaction.get(kickedRef);

      if (!teamDoc?.exists) {
        throw new functions.https.HttpsError("not-found", "Team doesn't exist");
      }
      if (teamDoc?.data()?.owner != context.auth.uid) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "User is not the owner of the team",
        );
      }
      if (!kickedDoc?.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Kicked user doesn't exist",
        );
      }
      if (kickedDoc?.data()?.team != context.auth.uid) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Kicked user is not in our team",
        );
      }

      transaction.set(
        teamRef,
        { members: admin.firestore.FieldValue.arrayRemove(data.kicked) },
        { merge: true },
      );
      transaction.set(
        kickedRef,
        {
          team: null,
          lastLeftTeam: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
    logger.log("Kicked team member", {
      user: context.auth.uid,
      kicked: data.kicked,
    });
    return { kicked: true };
  } catch (e) {
    logger.error("Failed to kick team member", {
      owner: context.auth.uid,
      kicked: data.kicked,
      error: e,
    });
    if (e instanceof functions.https.HttpsError) {
      throw e;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Error during team kick",
      e.message,
    );
  }
}

// --- Wrapped Cloud Functions (for deployment) ---
const leaveTeam = functions.https.onCall(_leaveTeamLogic);
const joinTeam = functions.https.onCall(_joinTeamLogic);
const createTeam = functions.https.onCall(_createTeamLogic);
const kickTeamMember = functions.https.onCall(_kickTeamMemberLogic);

// Export wrapped team functions using ESM
export { leaveTeam, joinTeam, createTeam, kickTeamMember };
// Export core logic functions for testing
export {
  _leaveTeamLogic,
  _joinTeamLogic,
  _createTeamLogic,
  _kickTeamMemberLogic,
};

// --- Tarkov Data Update Functions ---

// Use v2 onSchedule
const updateTarkovdata = onSchedule(
  { schedule: "every 60 minutes" },
  async (event) => {
    await retrieveTarkovdata();
    return null;
  },
);

// Using the scheduled function does not play nice with the emulators, so we use this instead to call it during local development
// This should be commented out when deploying to production
const updateTarkovdataHTTPS = functions.https.onRequest(
  async (request, response) => {
    await retrieveTarkovdata();
    response.status(200).send("OK");
  },
);

// Export tarkovdata functions using ESM
export { updateTarkovdata, updateTarkovdataHTTPS };

async function retrieveTarkovdata() {
  logger.log("Retrieving tarkovdata");
  // Import the tarkovdata hideout query
  //const hideoutQuery = require('./tarkovdata/hideoutQuery.js') // Keep commented

  const db = admin.firestore();

  // Requiring this from another file causes problems, so unfortunately we need to stick it here
  const hideoutQuery = gql`
    query TarkovDataHideout {
      hideoutStations {
        id
        levels {
          id
          level
          itemRequirements {
            id
            item {
              id
            }
            count
          }
        }
      }
    }
  `;

  try {
    const results = await request(
      "https://api.tarkov.dev/graphql",
      hideoutQuery,
      {},
      { "User-Agent": "tarkov-tracker-functions" },
    );
    logger.debug("Successfully pulled hideout data from tarkov.dev", results);

    const hideoutRef = db.collection("tarkovdata").doc("hideout");
    await hideoutRef.set(results);
  } catch (e) {
    logger.error("Error while pulling hideout data from tarkov.dev:", e);
  }

  // Next, retrieve the tarkovdata tasks
  const tasksQuery = gql`
    query TarkovDataTasks {
      tasks {
        id
        tarkovDataId
        name
        trader {
          id
        }
        map {
          id
        }
        experience
        minPlayerLevel
        taskRequirements {
          task {
            id
          }
          status
        }
        traderLevelRequirements {
          trader {
            id
          }
          level
        }
        objectives {
          id
          type
          optional
        }
        factionName
      }
    }
  `;

  try {
    let results = await request(
      "https://api.tarkov.dev/graphql",
      tasksQuery,
      {},
      { "User-Agent": "tarkov-tracker-functions" },
    );
    logger.debug("Successfully pulled tasks data from tarkov.dev", results);

    // Next, retrieve https://raw.githubusercontent.com/TarkovTracker/tarkovdata/master/task_alternatives.json and store it in the database
    const taskAlternativesResponse = await fetch(
      // Use imported fetch
      "https://raw.githubusercontent.com/TarkovTracker/tarkovdata/master/task_alternatives.json",
    );
    const taskAlternatives = await taskAlternativesResponse.json();

    logger.debug(
      "Successfully pulled task alternatives from tarkovdata repo",
      taskAlternatives,
    );
    // For each taskAlternative, find it in the tasks data and update it to include the alternatives
    Object.entries(taskAlternatives).forEach(([taskId, alternatives]) => {
      // Find the task in the tasks data and update the alternatives property
      // Get the index of the task in the tasks array
      const taskToUpdate = results.tasks.find((task) => task.id == taskId);
      if (taskToUpdate) {
        taskToUpdate.alternatives = alternatives;
      } else {
        logger.debug("Task not found in tasks data", {
          taskId: taskId,
          alternatives: alternatives,
        });
      }
    });

    const tasksRef = db.collection("tarkovdata").doc("tasks");
    await tasksRef.set(results);
  } catch (e) {
    logger.error("Error while pulling tasks data from tarkov.dev:", e);
  }
}

// Removed difference function as it wasn't used
