export const FREE_SUBSCRIPTION_LIMIT = 10;
export const FREE_CATEGORY_LIMIT = 5;
export const PREMIUM_MONTHLY_PRICE_YEN = 480;
export const STRIPE_TRIAL_PERIOD_DAYS = 7;
export const MIN_STRIPE_TRIAL_PERIOD_DAYS = 1;
export const MIN_TRIAL_REMAINING_DAYS = 0;
export const STRIPE_TRIAL_LOOKBACK_SUBSCRIPTION_LIMIT = 10;
export const STRIPE_SUBSCRIPTION_STATUS_ALL = "all";
export const STRIPE_TRIALING_STATUS = "trialing";
export const STRIPE_ACTIVE_SUBSCRIPTION_STATUSES = ["active", STRIPE_TRIALING_STATUS] as const;

export const DEFAULT_NOTIFY_DAYS_BEFORE = 7;
export const MAX_NOTIFY_DAYS_BEFORE = 60;
export const DEFAULT_NOTIFICATION_HOUR = 9;
export const MIN_NOTIFICATION_HOUR = 0;
export const MAX_NOTIFICATION_HOUR = 23;

export const MAX_USER_NAME_LENGTH = 100;
export const MAX_EMAIL_LENGTH = 255;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_CATEGORY_NAME_LENGTH = 50;
export const MAX_PAYMENT_METHOD_NAME_LENGTH = 50;
export const MAX_SUBSCRIPTION_NAME_LENGTH = 100;
export const MIN_CUSTOM_CYCLE_DAYS = 1;
export const MAX_CUSTOM_CYCLE_DAYS = 366;
export const MAX_MEMO_LENGTH = 1000;
export const MAX_PAYMENT_HISTORY_MEMO_LENGTH = 500;
export const MAX_SUBSCRIPTION_PRICE = 10_000_000;
export const MAX_CSV_IMPORT_FILE_BYTES = 1_000_000;
export const MAX_CSV_IMPORT_ROWS = 200;
export const MAX_CSV_IMPORT_ERROR_COUNT = 5;
export const MAX_CONTACT_MESSAGE_LENGTH = 2_000;
export const CONTACT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1_000;
export const CONTACT_RATE_LIMIT_MAX_REQUESTS = 3;
export const CONTACT_RATE_LIMIT_MAX_IDENTIFIERS = 1_000;
export const AUTH_RATE_LIMIT_WINDOW_MINUTES = 15;
export const AUTH_RATE_LIMIT_WINDOW_MS = AUTH_RATE_LIMIT_WINDOW_MINUTES * 60 * 1_000;
export const AUTH_RATE_LIMIT_MAX_ATTEMPTS = 10;
export const AUTH_RATE_LIMIT_MAX_IDENTIFIERS = 2_000;

export const DEFAULT_ADMIN_USER_EMAIL = "admin@shinji.work";
export const DEFAULT_DEMO_USER_EMAIL = "user@shinji.work";
export const SYSTEM_EMAIL_ADDRESS = "saas.system.shinji@gmail.com";
export const SYSTEM_EMAIL_FROM = `SubscList <${SYSTEM_EMAIL_ADDRESS}>`;
export const DASHBOARD_ANNOUNCEMENT_PAGE_SIZE = 5;
export const DASHBOARD_ANNOUNCEMENT_MAX_ITEMS = 100;

export const ALLOWED_URL_PROTOCOLS = ["http:", "https:"] as const;
export const PLACEHOLDER_HOSTS = ["example.com", "www.example.com"] as const;

export const REVIEW_STALE_DAYS = 90;
export const REVIEW_HIGH_AMOUNT_THRESHOLD = 3000;
export const REVIEW_MEDIUM_AMOUNT_THRESHOLD = 1500;
export const REVIEW_URGENT_SCORE_THRESHOLD = 70;
export const REVIEW_CAUTION_SCORE_THRESHOLD = 40;
export const UPCOMING_DEADLINE_DAYS = 14;

export const REVIEW_SCORE_WEIGHTS = {
  highAmount: 24,
  mediumAmount: 14,
  staleReview: 20,
  duplicateCategory: 16,
  rarelyUsed: 28,
  monthlyUse: 10,
  optionalPriority: 18,
  upcomingTrial: 14,
  upcomingCancellation: 14,
} as const;

export const SAME_CATEGORY_REVIEW_THRESHOLD = 3;

export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
export const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

export const CSV_MIN_YEARLY_GAP_DAYS = 330;
export const CSV_MAX_YEARLY_GAP_DAYS = 400;
export const CSV_MIN_MONTHLY_GAP_DAYS = 25;
export const CSV_MAX_MONTHLY_GAP_DAYS = 35;
export const CSV_MIN_WEEKLY_GAP_DAYS = 6;
export const CSV_MAX_WEEKLY_GAP_DAYS = 8;
export const CSV_MAX_CONFIDENCE = 98;
export const CSV_MIN_CANDIDATE_CONFIDENCE = 45;
export const CSV_MAX_CANDIDATE_COUNT = 30;
export const CSV_EXISTING_PRICE_TOLERANCE = 20;
export const CSV_CONFIDENCE_WEIGHTS = {
  knownMerchant: 36,
  recurringCycle: 34,
  enoughOccurrences: 14,
  alreadyRegistered: 12,
  hasDates: 4,
} as const;

export const CSV_RECURRING_MIN_OCCURRENCES = 2;
export const CSV_RECURRING_OCCURRENCE_THRESHOLD = 3;


