import { randomUUID } from 'crypto';
import { websiteConfig } from '@/config/website';
import {
  addCredits,
  addLifetimeMonthlyCredits,
  addSubscriptionCredits,
} from '@/credits/credits';
import { getCreditPackageById } from '@/credits/server';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { getDb } from '@/db';
import { payment, user } from '@/db/schema';
import {
  findPlanByPlanId,
  findPlanByPriceId,
  findPriceInPlan,
} from '@/lib/price-plan';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  type CheckoutResult,
  type CreateCheckoutParams,
  type CreateCreditCheckoutParams,
  type CreatePortalParams,
  type PaymentProvider,
  PaymentScenes,
  type PaymentStatus,
  PaymentTypes,
  type PlanInterval,
  PlanIntervals,
  type PortalResult,
  type Subscription,
  type getSubscriptionsParams,
} from '../types';

const CREEM_BASE_URL = 'https://api.creem.io';
const CREEM_TEST_BASE_URL = 'https://test-api.creem.io';

type CreemCheckoutResponse = {
  id?: string;
  checkout_url?: string;
  checkoutUrl?: string;
};

type CreemCustomerPortalResponse = {
  customer_portal_link?: string;
  customerPortalLink?: string;
};

type NormalizedSubscriptionPayload = {
  subscriptionId: string;
  customerId?: string;
  userId?: string;
  priceId?: string;
  status?: string;
  billingPeriod?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  trialStart?: Date;
  trialEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  sessionId?: string;
  invoiceId?: string;
};

const parseDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  const millis = Date.parse(String(value));
  if (Number.isNaN(millis)) {
    return undefined;
  }
  return new Date(millis);
};

const normalizeBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1';
  }
  return undefined;
};

/**
 * Creem payment provider implementation
 *
 * Test Mode docs:
 * https://docs.creem.io/test-mode
 */
export class CreemProvider implements PaymentProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly testMode: boolean;

  constructor() {
    const apiKey = process.env.CREEM_API_KEY;
    if (!apiKey) {
      throw new Error('CREEM_API_KEY environment variable is not set');
    }
    this.apiKey = apiKey;

    this.testMode =
      String(process.env.CREEM_TEST_MODE || '').toLowerCase() === 'true';
    this.baseUrl = this.testMode ? CREEM_TEST_BASE_URL : CREEM_BASE_URL;
  }

  private extractId(value: unknown, fallbackKey?: string): string | undefined {
    if (!value || typeof value === 'boolean') {
      return undefined;
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return (
        (record.id as string | undefined) ??
        (fallbackKey ? (record[fallbackKey] as string | undefined) : undefined)
      );
    }
    return undefined;
  }

  private extractMetadataUserId(metadata: unknown): string | undefined {
    if (!metadata || typeof metadata !== 'object') {
      return undefined;
    }
    const record = metadata as Record<string, unknown>;
    return (
      (record.userId as string | undefined) ||
      (record.user_id as string | undefined) ||
      (record.userid as string | undefined)
    );
  }

  private extractCustomerEmail(payload: any): string | undefined {
    const customer = payload?.customer;
    if (customer && typeof customer === 'object') {
      return customer.email as string | undefined;
    }
    const metadataEmail = payload?.metadata?.email;
    if (typeof metadataEmail === 'string') {
      return metadataEmail;
    }
    return undefined;
  }

  private extractBillingPeriod(payload: any): string | undefined {
    const product = payload?.product;
    if (product && typeof product === 'object') {
      return (
        (product.billing_period as string | undefined) ||
        (product.billingPeriod as string | undefined)
      );
    }
    return payload?.billing_period ?? payload?.billingPeriod;
  }

  private extractSubscriptionFromCheckout(
    payload: any
  ): NormalizedSubscriptionPayload | undefined {
    if (!payload) {
      return undefined;
    }
    const subscription = payload.subscription;
    if (!subscription || typeof subscription !== 'object') {
      return undefined;
    }
    const metadata = payload.metadata ?? subscription.metadata;
    return this.normalizeSubscriptionPayload(subscription, {
      fallbackCustomer: payload.customer,
      fallbackProduct: payload.product,
      fallbackStatus: payload.status,
      fallbackMetadata: metadata,
      sessionId: payload.id,
      invoiceId: payload.order?.id,
    });
  }

  private normalizeSubscriptionPayload(
    source: any,
    opts?: {
      fallbackCustomer?: any;
      fallbackProduct?: any;
      fallbackStatus?: string;
      fallbackMetadata?: any;
      sessionId?: string;
      invoiceId?: string;
    }
  ): NormalizedSubscriptionPayload | undefined {
    if (!source || typeof source !== 'object') {
      return undefined;
    }
    const metadata = source.metadata ?? opts?.fallbackMetadata;
    const product = source.product ?? opts?.fallbackProduct;
    const customer = source.customer ?? opts?.fallbackCustomer;

    const subscriptionId = this.extractId(source);
    if (!subscriptionId) {
      return undefined;
    }

    return {
      subscriptionId,
      sessionId: opts?.sessionId,
      invoiceId: opts?.invoiceId,
      customerId: this.extractId(customer),
      userId: this.extractMetadataUserId(metadata),
      priceId: this.extractId(product),
      status:
        (source.status as string | undefined) ??
        (opts?.fallbackStatus as string | undefined),
      billingPeriod: this.extractBillingPeriod({ product }),
      currentPeriodStart: parseDate(
        source.current_period_start_date ?? source.currentPeriodStartDate
      ),
      currentPeriodEnd: parseDate(
        source.current_period_end_date ?? source.currentPeriodEndDate
      ),
      trialStart: parseDate(
        source.trial_period_start_date ?? source.trialPeriodStartDate
      ),
      trialEnd: parseDate(
        source.trial_period_end_date ?? source.trialPeriodEndDate
      ),
      cancelAtPeriodEnd: normalizeBoolean(
        source.cancel_at_period_end ?? source.cancelAtPeriodEnd
      ),
    };
  }

  private async upsertSubscriptionRecord(
    payload: NormalizedSubscriptionPayload,
    options: { allowInsert?: boolean } = {}
  ): Promise<void> {
    const { subscriptionId } = payload;
    if (!subscriptionId) {
      console.warn('Creem: subscription payload missing subscriptionId');
      return;
    }

    const db = await getDb();
    const now = new Date();

    let userId = payload.userId;
    if (!userId && payload.customerId) {
      userId = await this.findUserIdByCustomerId(payload.customerId);
    }

    if (!userId) {
      console.warn(
        'Creem: unable to resolve user for subscription payload',
        subscriptionId
      );
      return;
    }

    const priceId = payload.priceId;
    if (!priceId) {
      console.warn(
        'Creem: subscription payload missing product/price id',
        subscriptionId
      );
      return;
    }

    const interval = this.toPlanInterval(payload.billingPeriod);
    const status = this.mapStatus(payload.status ?? 'active');
    const isPaid = status === 'active' || status === 'trialing' || status === 'completed';

    const updateData: Partial<typeof payment.$inferInsert> = {
      priceId,
      type: PaymentTypes.SUBSCRIPTION,
      scene: PaymentScenes.SUBSCRIPTION,
      interval,
      userId,
      customerId: payload.customerId || '',
      subscriptionId,
      status,
      paid: isPaid,
      updatedAt: now,
    };

    if (payload.sessionId) {
      updateData.sessionId = payload.sessionId;
    }
    if (payload.invoiceId) {
      updateData.invoiceId = payload.invoiceId;
    }
    if (payload.currentPeriodStart) {
      updateData.periodStart = payload.currentPeriodStart;
    }
    if (payload.currentPeriodEnd) {
      updateData.periodEnd = payload.currentPeriodEnd;
    }
    if (payload.trialStart) {
      updateData.trialStart = payload.trialStart;
    }
    if (payload.trialEnd) {
      updateData.trialEnd = payload.trialEnd;
    }
    if (payload.cancelAtPeriodEnd !== undefined) {
      updateData.cancelAtPeriodEnd = payload.cancelAtPeriodEnd;
    }

    const findExistingRecord = async () => {
      const bySub = await db
        .select({ id: payment.id })
        .from(payment)
        .where(eq(payment.subscriptionId, subscriptionId))
        .limit(1);
      if (bySub[0]) return bySub[0];

      if (payload.invoiceId) {
        const byInvoice = await db
          .select({ id: payment.id })
          .from(payment)
          .where(eq(payment.invoiceId, payload.invoiceId))
          .limit(1);
        if (byInvoice[0]) return byInvoice[0];
      }

      if (payload.sessionId) {
        const bySession = await db
          .select({ id: payment.id })
          .from(payment)
          .where(eq(payment.sessionId, payload.sessionId))
          .limit(1);
        if (bySession[0]) return bySession[0];
      }

      if (payload.customerId) {
        const oneTime = await db
          .select({ id: payment.id })
          .from(payment)
          .where(
            and(
              eq(payment.customerId, payload.customerId),
              eq(payment.priceId, priceId),
              isNull(payment.subscriptionId)
            )
          )
          .orderBy(desc(payment.createdAt))
          .limit(1);
        if (oneTime[0]) return oneTime[0];
      }

      return undefined;
    };

    let targetRecord = await findExistingRecord();

    if (!targetRecord) {
      // checkout.completed and subscription.paid may arrive nearly at the same time.
      // wait briefly and try again so we can upgrade the record created by checkout.completed
      await new Promise((resolve) => setTimeout(resolve, 80));
      targetRecord = await findExistingRecord();
    }

    if (targetRecord) {
      await db
        .update(payment)
        .set(updateData)
        .where(eq(payment.id, targetRecord.id));
      return;
    }

    if (!options.allowInsert) {
      console.warn(
        'Creem: subscription update skipped because record not found and insert disabled',
        subscriptionId
      );
      return;
    }

    const insertData: typeof payment.$inferInsert = {
      id: randomUUID(),
      priceId,
      type: PaymentTypes.SUBSCRIPTION,
      scene: PaymentScenes.SUBSCRIPTION,
      interval: interval ?? null,
      userId,
      customerId: payload.customerId || '',
      subscriptionId,
      sessionId: payload.sessionId ?? null,
      invoiceId: payload.invoiceId ?? null,
      status,
      paid: isPaid,
      periodStart: payload.currentPeriodStart ?? null,
      periodEnd: payload.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: payload.cancelAtPeriodEnd ?? null,
      trialStart: payload.trialStart ?? null,
      trialEnd: payload.trialEnd ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(payment).values(insertData);
  }

  /**
   * Create a checkout session for a plan (Creem: productId == priceId in our config)
   */
  public async createCheckout(
    params: CreateCheckoutParams
  ): Promise<CheckoutResult> {
    const { planId, priceId, customerEmail, successUrl, metadata } =
      params;
    try {
      // Validate plan & price to keep parity with Stripe flow
      const plan = findPlanByPlanId(planId);
      if (!plan) throw new Error(`Plan with ID ${planId} not found`);
      const price = findPriceInPlan(planId, priceId);
      if (!price)
        throw new Error(`Price ID ${priceId} not found in plan ${planId}`);

      const requestId = metadata?.userId || '';

      // Ensure successUrl placeholder is replaced to preserve post-success UX
      const finalSuccessUrl = (successUrl ?? '').replace(
        '{CHECKOUT_SESSION_ID}',
        'CREEM'
      );

      const payload = this.buildCheckoutPayload({
        productId: priceId,
        successUrl: finalSuccessUrl,
        requestId,
        metadata: {
          ...(metadata || {}),
          planId,
          priceId,
          email: customerEmail,
        },
        customerEmail,
      });

      const resp = await this.post<CreemCheckoutResponse>(
        '/v1/checkouts',
        payload,
        'createCheckout'
      );

      return {
        url: (resp.checkout_url ?? resp.checkoutUrl ?? '') as string,
        id: resp.id || '',
      };
    } catch (error) {
      console.error('Creem createCheckout error:', error);
      throw new Error('Failed to create checkout session');
    }
  }

  /**
   * Create a checkout session for a credit package
   */
  public async createCreditCheckout(
    params: CreateCreditCheckoutParams
  ): Promise<CheckoutResult> {
    const {
      packageId,
      priceId: inputPriceId,
      customerEmail,
      successUrl,
      cancelUrl,
      metadata,
    } = params;
    try {
      const creditPackage = getCreditPackageById(packageId);
      if (!creditPackage)
        throw new Error(`Credit package with ID ${packageId} not found`);

      // Use productId from credit package config to ensure correctness
      const productId = creditPackage.price.priceId;
      if (!productId)
        throw new Error(`Price ID not found for credit package ${packageId}`);

      const requestId = metadata?.userId || '';

      // Ensure successUrl placeholder is replaced to preserve post-success UX
      const finalSuccessUrl = (successUrl ?? '').replace(
        '{CHECKOUT_SESSION_ID}',
        'CREEM'
      );

      const payload = this.buildCheckoutPayload({
        productId,
        successUrl: finalSuccessUrl,
        requestId,
        metadata: {
          ...(metadata || {}),
          type: 'credit_purchase',
          packageId,
          credits: String(creditPackage.amount),
          priceId: productId,
          email: customerEmail,
        },
        customerEmail,
      });

      const resp = await this.post<CreemCheckoutResponse>(
        '/v1/checkouts',
        payload,
        'createCreditCheckout'
      );

      return {
        url: (resp.checkout_url ?? resp.checkoutUrl ?? '') as string,
        id: resp.id || '',
      };
    } catch (error) {
      console.error('Creem createCreditCheckout error:', error);
      throw new Error('Failed to create credit checkout session');
    }
  }

  /**
   * Create a customer portal session
   */
  public async createCustomerPortal(
    params: CreatePortalParams
  ): Promise<PortalResult> {
    const { customerId, returnUrl } = params;
    try {
      const resp = await this.post<CreemCustomerPortalResponse>(
        '/v1/customers/billing',
        {
          customer_id: customerId,
        },
        'createCustomerPortal'
      );
      return {
        url: (resp.customer_portal_link ?? resp.customerPortalLink ?? '') as string,
      };
    } catch (error) {
      console.error('Creem createCustomerPortal error:', error);
      throw new Error('Failed to create customer portal');
    }
  }

  /**
   * Get subscriptions from local DB (same behavior as Stripe implementation)
   */
  public async getSubscriptions(
    params: getSubscriptionsParams
  ): Promise<Subscription[]> {
    const { userId } = params;
    try {
      const db = await getDb();
      const subscriptions = await db
        .select()
        .from(payment)
        .where(eq(payment.userId, userId))
        .orderBy(desc(payment.createdAt));

      return subscriptions.map((subscription) => ({
        id: subscription.subscriptionId || '',
        customerId: subscription.customerId,
        priceId: subscription.priceId,
        status: subscription.status as PaymentStatus,
        type: subscription.type as PaymentTypes,
        interval: subscription.interval as PlanInterval,
        currentPeriodStart: subscription.periodStart || undefined,
        currentPeriodEnd: subscription.periodEnd || undefined,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || false,
        trialStartDate: subscription.trialStart || undefined,
        trialEndDate: subscription.trialEnd || undefined,
        createdAt: subscription.createdAt,
      }));
    } catch (error) {
      console.error('Creem list subscriptions error:', error);
      return [];
    }
  }

  /**
   * Handle webhook event (payload is JSON string for Creem)
   */
  public async handleWebhookEvent(
    payload: string,
    _signature: string
  ): Promise<void> {
    try {
      const event = JSON.parse(payload || '{}');
      const eventType: string = event.eventType;
      const object = event.object || {};

      // One-time checkout completed
      if (eventType === 'checkout.completed') {
        await this.onCheckoutCompleted(object);
        return;
      }

      // Subscription lifecycle
      if (eventType === 'subscription.paid') {
        await this.onSubscriptionPaid(object);
        return;
      }
      if (eventType === 'subscription.canceled') {
        await this.onSubscriptionCanceled(object);
        return;
      }
      if (eventType === 'subscription.expired') {
        await this.onSubscriptionExpired(object);
        return;
      }
    } catch (error) {
      console.error('Creem handle webhook event error:', error);
      throw new Error('Failed to handle webhook event');
    }
  }

  // ============ Internal helpers ============

  private async updateUserWithCustomerId(
    customerId: string | undefined,
    userId?: string,
    email?: string
  ) {
    if (!customerId) {
      return;
    }
    try {
      const db = await getDb();
      if (userId) {
        await db
          .update(user)
          .set({ customerId, updatedAt: new Date() })
          .where(eq(user.id, userId));
        return;
      }
      if (email) {
        await db
          .update(user)
          .set({ customerId, updatedAt: new Date() })
          .where(eq(user.email, email));
      }
    } catch (error) {
      console.error('Creem update user customerId error:', error);
    }
  }

  private async findUserIdByCustomerId(
    customerId: string | undefined
  ): Promise<string | undefined> {
    if (!customerId) {
      return undefined;
    }
    try {
      const db = await getDb();
      const result = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.customerId, customerId))
        .limit(1);
      return result[0]?.id;
    } catch (error) {
      console.error('Creem find user by customer ID error:', error);
      return undefined;
    }
  }

  private toPlanInterval(_billingPeriod?: string): PlanInterval | undefined {
    // Creem provides billing period codes (e.g., one-m, one-y, etc.)
    // We map monthly/yearly where possible; otherwise leave undefined.
    switch ((_billingPeriod || '').toLowerCase()) {
      case 'one-m':
      case 'monthly':
      case 'month':
      case 'every-month':
      case 'every-1-month':
        return PlanIntervals.MONTH;
      case 'one-y':
      case 'yearly':
      case 'year':
      case 'every-year':
      case 'every-1-year':
        return PlanIntervals.YEAR;
      default:
        return undefined;
    }
  }

  private mapStatus(status: string): PaymentStatus {
    const map: Record<string, PaymentStatus> = {
      active: 'active',
      canceled: 'canceled',
      expired: 'unpaid',
      paid: 'active',
      completed: 'completed',
      failed: 'failed',
      processing: 'processing',
    };
    return map[status] || 'failed';
  }

  private async onCheckoutCompleted(object: any) {
    const sessionId = object?.id as string;
    const customerId = object?.customer?.id as string;
    const productId = object?.product?.id as string; // use as priceId in our schema
    const requestUserId = object?.request_id as string | undefined;
    if (!productId) {
      console.warn('Creem checkout.completed missing productId');
      return;
    }

    const metadata = object?.metadata;
    const subscriptionPayload = this.extractSubscriptionFromCheckout(object);

    const metadataUserId =
      this.extractMetadataUserId(metadata) ?? requestUserId ?? undefined;
    const customerEmail = this.extractCustomerEmail(object);

    await this.updateUserWithCustomerId(customerId, metadataUserId, customerEmail);

    if (subscriptionPayload) {
      await this.upsertSubscriptionRecord({
        ...subscriptionPayload,
        priceId: subscriptionPayload.priceId ?? productId,
        customerId: subscriptionPayload.customerId ?? customerId,
        userId: subscriptionPayload.userId ?? metadataUserId,
        sessionId: sessionId || subscriptionPayload.sessionId,
        invoiceId: object?.order?.id ?? subscriptionPayload.invoiceId,
      }, { allowInsert: true });
      return;
    }

    const db = await getDb();

    // Prevent double-processing by sessionId
    if (sessionId) {
      const exist = await db
        .select({ id: payment.id })
        .from(payment)
        .where(eq(payment.sessionId, sessionId))
        .limit(1);
      if (exist.length > 0) {
        console.log('Creem checkout already processed: ' + sessionId);
        return;
      }
    }

    const now = new Date();

    let userId = metadataUserId ?? (await this.findUserIdByCustomerId(customerId));
    if (!userId) {
      console.warn(
        'Creem checkout.completed: unable to resolve user, skipping payment record'
      );
      return;
    }

    // Determine if this is a credit purchase by matching productId with credit packages
    const pkg = Object.values(websiteConfig.credits.packages).find(
      (p) => p.price.priceId === productId
    );
    const isCreditPackage = !!pkg;
    const scene = isCreditPackage
      ? PaymentScenes.CREDIT
      : PaymentScenes.LIFETIME;

    const createFields: any = {
      id: randomUUID(),
      priceId: productId,
      type: PaymentTypes.ONE_TIME,
      scene,
      paid: true,
      userId,
      customerId: customerId || '',
      sessionId: sessionId || undefined,
      invoiceId: object?.order?.id ?? undefined,
      status: this.mapStatus(object?.status ?? 'completed'),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(payment).values(createFields);

    if (isCreditPackage) {
      if (pkg) {
        await addCredits({
          userId,
          amount: pkg.amount,
          type: CREDIT_TRANSACTION_TYPE.PURCHASE_PACKAGE,
          description: `+${pkg.amount} credits for package ${pkg.id}`,
          paymentId: sessionId,
          expireDays: pkg.expireDays,
        });
        console.log('Creem: added credits for user: ' + userId);
      }
    } else {
      const lifetimePlan = findPlanByPriceId(productId);
      if (lifetimePlan?.isLifetime) {
        await addLifetimeMonthlyCredits(userId, productId);
        console.log('Creem: lifetime monthly credits added for user: ' + userId);
      }
    }
  }

  private async onSubscriptionPaid(object: any) {
    const normalized = this.normalizeSubscriptionPayload(object, {
      fallbackCustomer: object?.customer,
      fallbackProduct: object?.product,
      fallbackStatus: object?.status,
    });

    if (!normalized) {
      console.warn('Creem subscription.paid payload missing subscription data');
      return;
    }

    await this.updateUserWithCustomerId(
      normalized.customerId ?? this.extractId(object?.customer),
      normalized.userId,
      this.extractCustomerEmail(object)
    );

    await this.upsertSubscriptionRecord(normalized);

    const userId =
      normalized.userId ??
      (normalized.customerId
        ? await this.findUserIdByCustomerId(normalized.customerId)
        : undefined);

    if (userId && normalized.priceId && websiteConfig.credits?.enableCredits) {
      await addSubscriptionCredits(userId, normalized.priceId);
    }
  }

  private async onSubscriptionCanceled(object: any) {
    const normalized = this.normalizeSubscriptionPayload(object, {
      fallbackStatus: 'canceled',
    });

    if (!normalized) {
      console.warn('Creem subscription.canceled missing subscription data');
      return;
    }

    normalized.status = 'canceled';
    normalized.cancelAtPeriodEnd = true;
    await this.upsertSubscriptionRecord(normalized);
  }

  private async onSubscriptionExpired(object: any) {
    const normalized = this.normalizeSubscriptionPayload(object, {
      fallbackStatus: 'unpaid',
    });

    if (!normalized) {
      console.warn('Creem subscription.expired missing subscription data');
      return;
    }

    normalized.status = 'unpaid';
    await this.upsertSubscriptionRecord(normalized);
  }

  private async post<T extends object>(
    path: string,
    body: Record<string, unknown>,
    context: string
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const payload = JSON.stringify(this.removeUndefined(body));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-key': this.apiKey,
      },
      body: payload,
    });

    const text = await response.text();
    let data: Record<string, unknown> | undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        console.error(`Creem ${context} response parse error:`, error, text);
      }
    }

    if (!response.ok) {
      console.error(`Creem ${context} API error:`, response.status, data ?? text);
      throw new Error('Creem API request failed');
    }

    return (data ?? {}) as T;
  }

  private buildCheckoutPayload(params: {
    productId: string;
    successUrl?: string;
    requestId?: string;
    metadata?: Record<string, string | undefined>;
    customerEmail?: string;
  }): Record<string, unknown> {
    const { productId, successUrl, requestId, metadata, customerEmail } = params;
    const sanitizedMetadata = this.removeUndefined(metadata ?? {});

    return this.removeUndefined({
      product_id: productId,
      success_url: successUrl || undefined,
      request_id: requestId || undefined,
      units: 1,
      customer: customerEmail ? { email: customerEmail } : undefined,
      metadata:
        Object.keys(sanitizedMetadata).length > 0 ? sanitizedMetadata : undefined,
    });
  }

  private removeUndefined<T>(value: T): T {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.removeUndefined(item))
        .filter((item) => item !== undefined) as unknown as T;
    }
    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (val === undefined) continue;
        const cleaned = this.removeUndefined(val);
        if (cleaned !== undefined) {
          result[key] = cleaned;
        }
      }
      return result as T;
    }
    return value;
  }
}
