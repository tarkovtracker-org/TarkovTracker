import { withProviderBudget } from './provider-execution.ts';
import { BillingVerificationBlocked, verifyAccountBilling } from './final-billing-verification.ts';
import {
  type AccountDeletionClient,
  deleteUserWithRetry,
  recordDeletionFailure,
} from './account-deletion-lifecycle.ts';
type Result = { status: string; stage: string };
type Context = {
  client: AccountDeletionClient;
  userId: string;
  claimToken: string;
  stage: string;
};
const rpcStage = async (context: Context, name: string) => {
  const { client, userId, claimToken } = context;
  const { data, error } = await client.rpc(name, {
    p_user_id: userId,
    p_claim_token: claimToken,
  });
  if (error) throw new Error(name);
  return data;
};
const persistFailure = async (
  context: Context,
  reason: string,
  status: string
): Promise<Result> => {
  const { client, userId, claimToken, stage } = context;
  if (
    [
      'provider_wait',
      'operator_review',
      'blocked_successor',
      'cancelled',
      'provider_pending',
    ].includes(reason)
  ) {
    const parked = await client.rpc('park_account_lifecycle', {
      p_user_id: userId,
      p_claim_token: claimToken,
      p_reason: reason,
    });
    return { status: parkedStatus(parked, status), stage };
  }
  const transition = await recordDeletionFailure(
    client,
    userId,
    claimToken,
    reason,
    { stage },
    '[account-deletion]'
  );
  return { status: transition === 'persisted' ? status : transition, stage };
};
const prepare = async (context: Context): Promise<Result | null> => {
  const result = await rpcStage(context, 'prepare_account_deletion');
  if (result === 'ready') return null;
  if (result === 'lease_lost') {
    return { status: 'lease_lost', stage: context.stage };
  }
  return persistFailure(context, String(result), String(result));
};
const deleteAuth = async (context: Context, wait?: (ms: number) => Promise<void>) => {
  const auth = {
    admin: {
      deleteUser: async (id: string) => {
        const truth = await verifyAccountBilling(
          context.client,
          context.userId,
          context.claimToken
        );
        if (truth !== 'clear') throw new BillingVerificationBlocked(truth);
        const allowed = await rpcStage(context, 'authorize_account_auth_delete');
        if (allowed !== true) throw new BillingVerificationBlocked('provider_pending');
        return context.client.auth.admin.deleteUser(id);
      },
    },
  };
  const result = await deleteUserWithRetry({ auth }, context.userId, wait);
  if (!result.ok) throw new Error('auth_delete_failed');
};
const finish = async (context: Context): Promise<Result> => {
  const result = await rpcStage(context, 'finish_account_deletion');
  if (!['completed', 'lease_lost'].includes(String(result))) {
    throw new Error('completion_blocked');
  }
  return { status: String(result), stage: context.stage };
};
const runAccountDeletionStages = async (
  client: AccountDeletionClient,
  userId: string,
  claimToken: string,
  wait?: (ms: number) => Promise<void>
): Promise<Result> => {
  const context = { client, userId, claimToken, stage: 'prepare' };
  try {
    const blocked = await resumePreparation(context);
    if (blocked) return blocked;
    context.stage = 'auth_delete';
    await deleteAuth(context, wait);
    context.stage = 'finish';
    return await finish(context);
  } catch (error) {
    if (error instanceof BillingVerificationBlocked) {
      return persistFailure(context, error.status, error.status);
    }
    return persistFailure(context, 'workflow_stage_failed', 'failed');
  }
};
async function resumePreparation(context: Context): Promise<Result | null> {
  const stage = await rpcStage(context, 'account_deletion_resume_stage');
  if (stage === 'auth_delete') return null;
  if (stage === 'prepare') return prepareStages(context);
  return { status: 'lease_lost', stage: context.stage };
}
function parkedStatus(result: { data: unknown; error: unknown }, status: string): string {
  return result.data === true && !result.error ? status : 'lease_lost';
}
async function prepareStages(context: Context): Promise<Result | null> {
  context.stage = 'final_billing';
  const truth = await verifyAccountBilling(context.client, context.userId, context.claimToken);
  if (truth !== 'clear') return persistFailure(context, truth, truth);
  context.stage = 'seal';
  const sealed = await rpcStage(context, 'seal_account_lifecycle');
  if (sealed === 'lease_lost') {
    return { status: 'lease_lost', stage: context.stage };
  }
  if (sealed !== 'ready') {
    return persistFailure(context, String(sealed), String(sealed));
  }
  context.stage = 'prepare';
  return prepare(context);
}
export const runAccountDeletion = (
  client: AccountDeletionClient,
  userId: string,
  claimToken: string,
  wait?: (ms: number) => Promise<void>
): Promise<Result> =>
  withProviderBudget(() => runAccountDeletionStages(client, userId, claimToken, wait));
