import { PaymentTypes, PlanIntervals } from '@/payment/types';
import type { WebsiteConfig } from '@/types';

/**
 * website config, without translations
 *
 * docs:
 * https://mksaas.com/docs/config/website
 */
// Select payment provider via env, default to 'stripe'
const RAW_PROVIDER = (
  process.env.NEXT_PUBLIC_PAYMENT_PROVIDER ||
  process.env.PAYMENT_PROVIDER ||
  'stripe'
).toLowerCase();
const PAYMENT_PROVIDER: 'stripe' | 'creem' =
  RAW_PROVIDER === 'creem' ? 'creem' : 'stripe';

const ENABLE_CREDITS_ENV = process.env.NEXT_PUBLIC_ENABLE_CREDITS;
const ENABLE_CREDITS =
  ENABLE_CREDITS_ENV !== undefined
    ? ENABLE_CREDITS_ENV === 'true'
    : process.env.NEXT_PUBLIC_DEMO_WEBSITE === 'true';

const STRIPE_PRICE_IDS = {
  PRO_MONTHLY: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY || '',
  PRO_YEARLY: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY || '',
  LIFETIME: process.env.NEXT_PUBLIC_STRIPE_PRICE_LIFETIME || '',
  CREDITS_BASIC: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_BASIC || '',
  CREDITS_STANDARD:
    process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_STANDARD || '',
  CREDITS_PREMIUM:
    process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_PREMIUM || '',
  CREDITS_ENTERPRISE:
    process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_ENTERPRISE || '',
};

const CREEM_PRICE_IDS = {
  PRO_MONTHLY: process.env.NEXT_PUBLIC_CREEM_PRODUCT_PRO_MONTHLY || '',
  PRO_YEARLY: process.env.NEXT_PUBLIC_CREEM_PRODUCT_PRO_YEARLY || '',
  LIFETIME: process.env.NEXT_PUBLIC_CREEM_PRODUCT_LIFETIME || '',
  CREDITS_BASIC:
    process.env.NEXT_PUBLIC_CREEM_PRODUCT_CREDITS_BASIC || '',
  CREDITS_STANDARD:
    process.env.NEXT_PUBLIC_CREEM_PRODUCT_CREDITS_STANDARD || '',
  CREDITS_PREMIUM:
    process.env.NEXT_PUBLIC_CREEM_PRODUCT_CREDITS_PREMIUM || '',
  CREDITS_ENTERPRISE:
    process.env.NEXT_PUBLIC_CREEM_PRODUCT_CREDITS_ENTERPRISE || '',
};

// Map plan price identifiers by provider
const PRICE_IDS =
  PAYMENT_PROVIDER === 'stripe' ? STRIPE_PRICE_IDS : CREEM_PRICE_IDS;

export const websiteConfig: WebsiteConfig = {
  ui: {
    theme: {
      defaultTheme: 'default',
      enableSwitch: true,
    },
    mode: {
      defaultMode: 'light',
      enableSwitch: true,
    },
  },
  metadata: {
    images: {
      ogImage: '/og.png',
      logoLight: '/logo.png',
      logoDark: '/logo-dark.png',
    },
    social: {
      github: 'https://github.com/MkSaaSHQ',
      twitter: 'https://mksaas.link/twitter',
      blueSky: 'https://mksaas.link/bsky',
      discord: 'https://mksaas.link/discord',
      mastodon: 'https://mksaas.link/mastodon',
      linkedin: 'https://mksaas.link/linkedin',
      youtube: 'https://mksaas.link/youtube',
    },
  },
  features: {
    enableUpgradeCard: true,
    enableUpdateAvatar: true,
    enableAffonsoAffiliate: false,
    enablePromotekitAffiliate: false,
    enableDatafastRevenueTrack: false,
    enableCrispChat: process.env.NEXT_PUBLIC_DEMO_WEBSITE === 'true',
    enableTurnstileCaptcha: process.env.NEXT_PUBLIC_DEMO_WEBSITE === 'true',
  },
  routes: {
    defaultLoginRedirect: '/dashboard',
  },
  analytics: {
    enableVercelAnalytics: false,
    enableSpeedInsights: false,
  },
  auth: {
    enableGoogleLogin: true,
    enableGithubLogin: true,
    enableCredentialLogin: true,
  },
  i18n: {
    defaultLocale: 'en',
    locales: {
      en: {
        flag: '🇺🇸',
        name: 'English',
        hreflang: 'en',
      },
      zh: {
        flag: '🇨🇳',
        name: '中文',
        hreflang: 'zh-CN',
      },
    },
  },
  blog: {
    enable: true,
    paginationSize: 6,
    relatedPostsSize: 3,
  },
  docs: {
    enable: true,
  },
  mail: {
    provider: 'resend',
    fromEmail: 'MkSaaS <support@mksaas.com>',
    supportEmail: 'MkSaaS <support@mksaas.com>',
  },
  newsletter: {
    enable: true,
    provider: 'resend',
    autoSubscribeAfterSignUp: true,
  },
  storage: {
    enable: true,
    provider: 's3',
  },
  payment: {
    provider: PAYMENT_PROVIDER,
  },
  price: {
    plans: {
      free: {
        id: 'free',
        prices: [],
        isFree: true,
        isLifetime: false,
        credits: {
          enable: true,
          amount: 50,
          expireDays: 30,
        },
      },
      pro: {
        id: 'pro',
        prices: [
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: PRICE_IDS.PRO_MONTHLY,
            amount: 990,
            currency: 'USD',
            interval: PlanIntervals.MONTH,
          },
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: PRICE_IDS.PRO_YEARLY,
            amount: 9900,
            currency: 'USD',
            interval: PlanIntervals.YEAR,
          },
        ],
        isFree: false,
        isLifetime: false,
        popular: true,
        credits: {
          enable: true,
          amount: 1000,
          expireDays: 30,
        },
      },
      lifetime: {
        id: 'lifetime',
        prices: [
          {
            type: PaymentTypes.ONE_TIME,
            priceId: PRICE_IDS.LIFETIME,
            amount: 19900,
            currency: 'USD',
            allowPromotionCode: true,
          },
        ],
        isFree: false,
        isLifetime: true,
        credits: {
          enable: true,
          amount: 1000,
          expireDays: 30,
        },
      },
    },
  },
  credits: {
    enableCredits: ENABLE_CREDITS,
    enablePackagesForFreePlan: true,
    registerGiftCredits: {
      enable: true,
      amount: 50,
      expireDays: 30,
    },
    packages: {
      basic: {
        id: 'basic',
        popular: false,
        amount: 100,
        expireDays: 30,
        price: {
          priceId: PRICE_IDS.CREDITS_BASIC,
          amount: 990,
          currency: 'USD',
          allowPromotionCode: true,
        },
      },
      standard: {
        id: 'standard',
        popular: true,
        amount: 200,
        expireDays: 30,
        price: {
          priceId: PRICE_IDS.CREDITS_STANDARD,
          amount: 1490,
          currency: 'USD',
          allowPromotionCode: true,
        },
      },
      premium: {
        id: 'premium',
        popular: false,
        amount: 500,
        expireDays: 30,
        price: {
          priceId: PRICE_IDS.CREDITS_PREMIUM,
          amount: 3990,
          currency: 'USD',
          allowPromotionCode: true,
        },
      },
      enterprise: {
        id: 'enterprise',
        popular: false,
        amount: 1000,
        expireDays: 30,
        price: {
          priceId: PRICE_IDS.CREDITS_ENTERPRISE,
          amount: 6990,
          currency: 'USD',
          allowPromotionCode: true,
        },
      },
    },
  },
};
