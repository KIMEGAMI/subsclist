"use client";

import bcrypt from "bcryptjs";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  defaultAccounts,
  defaultCategories,
  defaultContactMessages,
  defaultPaymentMethods,
  defaultSiteSettings,
  defaultSubscriptions,
  defaultUser,
} from "@/lib/demo-data";
import type { PersistedState } from "@/lib/persisted-state";
import type { AccountRecord, Category, ContactMessage, PaymentMethod, Plan, SiteSettings, Subscription, UserAccount } from "@/lib/types";

type AuthResult = {
  ok: true;
  user: UserAccount;
  message?: string;
} | {
  ok: false;
  message: string;
};

type Store = {
  user: UserAccount;
  accounts: AccountRecord[];
  siteSettings: SiteSettings;
  contactMessages: ContactMessage[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  subscriptions: Subscription[];
  login: (email: string, password: string) => AuthResult;
  registerAccount: (input: { name: string; email: string; password: string }) => AuthResult;
  updatePassword: (currentPassword: string, nextPassword: string) => AuthResult;
  logout: () => void;
  setUser: (user: UserAccount) => void;
  setPlan: (plan: Plan) => void;
  verifyEmail: () => void;
  toggleMaintenanceMode: (nextValue?: boolean) => void;
  saveContactMessage: (message: ContactMessage) => void;
  updateContactMessageStatus: (id: string, status: ContactMessage["status"]) => void;
  deleteContactMessage: (id: string) => void;
  saveSubscription: (subscription: Subscription) => void;
  deleteSubscription: (id: string) => void;
  saveCategory: (category: Category) => void;
  deleteCategory: (id: string) => void;
  savePaymentMethod: (method: PaymentMethod) => void;
  deletePaymentMethod: (id: string) => void;
};

const StoreContext = createContext<Store | null>(null);

const storageKey = "subsclist-state-v2";
const legacyStorageKey = "subsclist-state-v1";

function stripPassword(account: AccountRecord): UserAccount {
  const { passwordHash, ...user } = account;
  void passwordHash;
  return user;
}

function createInitialState(): PersistedState {
  return {
    user: defaultUser,
    accounts: defaultAccounts,
    siteSettings: defaultSiteSettings,
    contactMessages: defaultContactMessages,
    categories: defaultCategories,
    paymentMethods: defaultPaymentMethods,
    subscriptions: defaultSubscriptions,
  };
}

function normalizeUser(user: Partial<UserAccount> | undefined): UserAccount {
  return {
    id: user?.id ?? defaultUser.id,
    name: user?.name ?? defaultUser.name,
    email: user?.email ?? defaultUser.email,
    plan: user?.plan ?? defaultUser.plan,
    emailVerified: user?.emailVerified ?? defaultUser.emailVerified,
    role: user?.role ?? defaultUser.role,
  };
}

function migrateLegacyState(raw: Partial<PersistedState> & { user?: Partial<UserAccount> }): PersistedState {
  return {
    user: normalizeUser(raw.user),
    accounts: defaultAccounts,
    siteSettings: defaultSiteSettings,
    contactMessages: defaultContactMessages,
    categories: raw.categories ?? defaultCategories,
    paymentMethods: raw.paymentMethods ?? defaultPaymentMethods,
    subscriptions: raw.subscriptions ?? defaultSubscriptions,
  };
}

function loadPersisted(): PersistedState {
  if (typeof window === "undefined") {
    return createInitialState();
  }

  const currentRaw = window.localStorage.getItem(storageKey);
  if (currentRaw) {
    try {
      const parsed = JSON.parse(currentRaw) as Partial<PersistedState>;
      return {
        user: parsed.user ? normalizeUser(parsed.user) : defaultUser,
        accounts: parsed.accounts ?? defaultAccounts,
        siteSettings: parsed.siteSettings ?? defaultSiteSettings,
        contactMessages: parsed.contactMessages ?? defaultContactMessages,
        categories: parsed.categories ?? defaultCategories,
        paymentMethods: parsed.paymentMethods ?? defaultPaymentMethods,
        subscriptions: parsed.subscriptions ?? defaultSubscriptions,
      };
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }

  const legacyRaw = window.localStorage.getItem(legacyStorageKey);
  if (legacyRaw) {
    try {
      const parsed = JSON.parse(legacyRaw) as Partial<PersistedState> & { user?: Partial<UserAccount> };
      return migrateLegacyState(parsed);
    } catch {
      window.localStorage.removeItem(legacyStorageKey);
    }
  }

  return createInitialState();
}

function upsertAccount(accounts: AccountRecord[], account: UserAccount, passwordHash?: string) {
  const existing = accounts.find((item) => item.id === account.id) ?? accounts.find((item) => item.email.toLowerCase() === account.email.toLowerCase());
  if (existing) {
    return accounts.map((item) =>
      item.id === existing.id ? { ...item, ...account, passwordHash: passwordHash ?? item.passwordHash } : item,
    );
  }

  if (!passwordHash) {
    return accounts;
  }

  return [...accounts, { ...account, passwordHash }];
}

export function StoreProvider({ children, initialState }: { children: React.ReactNode; initialState?: PersistedState }) {
  const initial = useMemo(() => initialState ?? loadPersisted(), [initialState]);
  const [user, setUserState] = useState<UserAccount>(initial.user);
  const [accounts, setAccounts] = useState<AccountRecord[]>(initial.accounts);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(initial.siteSettings);
  const [contactMessages, setContactMessages] = useState<ContactMessage[]>(initial.contactMessages);
  const [categories, setCategories] = useState<Category[]>(initial.categories);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(initial.paymentMethods);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(initial.subscriptions);

  useEffect(() => {
    const payload: PersistedState = {
      user,
      accounts,
      siteSettings,
      contactMessages,
      categories,
      paymentMethods,
      subscriptions,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [accounts, categories, contactMessages, paymentMethods, siteSettings, subscriptions, user]);

  const value = useMemo<Store>(
    () => ({
      user,
      accounts,
      siteSettings,
      contactMessages,
      categories,
      paymentMethods,
      subscriptions,
      login: (email, password) => {
        const account = accounts.find((item) => item.email.toLowerCase() === email.toLowerCase());
        if (!account) {
          return { ok: false, message: "メールアドレスが見つかりません。" };
        }
        if (!bcrypt.compareSync(password, account.passwordHash)) {
          return { ok: false, message: "メールアドレスまたはパスワードが正しくありません。" };
        }
        const nextUser = stripPassword(account);
        setUserState(nextUser);
        return { ok: true, user: nextUser, message: "ログインしました。" };
      },
      registerAccount: ({ name, email, password }) => {
        if (accounts.some((item) => item.email.toLowerCase() === email.toLowerCase())) {
          return { ok: false, message: "このメールアドレスは既に登録されています。" };
        }
        const nextUser: UserAccount = {
          id: `user-${crypto.randomUUID()}`,
          name,
          email,
          plan: "free",
          emailVerified: false,
          role: "user",
        };
        const account: AccountRecord = {
          ...nextUser,
          passwordHash: bcrypt.hashSync(password, 10),
        };
        setAccounts((current) => [...current, account]);
        setUserState(nextUser);
        return { ok: true, user: nextUser, message: "登録しました。" };
      },
      updatePassword: (currentPassword, nextPassword) => {
        const currentAccount = accounts.find((item) => item.id === user.id) ?? accounts.find((item) => item.email.toLowerCase() === user.email.toLowerCase());
        if (!currentAccount) {
          return { ok: false, message: "アカウントが見つかりません。" };
        }
        if (!bcrypt.compareSync(currentPassword, currentAccount.passwordHash)) {
          return { ok: false, message: "現在のパスワードが一致しません。" };
        }
        const nextHash = bcrypt.hashSync(nextPassword, 10);
        setAccounts((current) =>
          current.map((item) => (item.id === currentAccount.id ? { ...item, passwordHash: nextHash } : item)),
        );
        return { ok: true, user, message: "パスワードを変更しました。" };
      },
      logout: () => {
        setUserState(defaultUser);
      },
      setUser: (nextUser) => {
        setUserState(nextUser);
        setAccounts((current) => upsertAccount(current, nextUser));
      },
      setPlan: (plan) => {
        setUserState((current) => {
          const nextUser = { ...current, plan };
          setAccounts((accountList) => upsertAccount(accountList, nextUser));
          return nextUser;
        });
      },
      verifyEmail: () => {
        setUserState((current) => {
          const nextUser = { ...current, emailVerified: true };
          setAccounts((accountList) => upsertAccount(accountList, nextUser));
          return nextUser;
        });
      },
      toggleMaintenanceMode: (nextValue) => {
        setSiteSettings((current) => ({ ...current, maintenanceMode: nextValue ?? !current.maintenanceMode }));
      },
      saveContactMessage: (message) => {
        setContactMessages((current) => {
          const exists = current.some((item) => item.id === message.id);
          return exists ? current.map((item) => (item.id === message.id ? message : item)) : [message, ...current];
        });
      },
      updateContactMessageStatus: (id, status) => {
        setContactMessages((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));
      },
      deleteContactMessage: (id) => {
        setContactMessages((current) => current.filter((item) => item.id !== id));
      },
      saveSubscription: (subscription) =>
        setSubscriptions((current) => {
          const exists = current.some((item) => item.id === subscription.id);
          return exists ? current.map((item) => (item.id === subscription.id ? subscription : item)) : [subscription, ...current];
        }),
      deleteSubscription: (id) =>
        setSubscriptions((current) =>
          current.map((item) => (item.id === id ? { ...item, deletedAt: new Date().toISOString() } : item)),
        ),
      saveCategory: (category) =>
        setCategories((current) => {
          const exists = current.some((item) => item.id === category.id);
          return exists ? current.map((item) => (item.id === category.id ? category : item)) : [...current, category];
        }),
      deleteCategory: (id) => setCategories((current) => current.filter((item) => item.id !== id)),
      savePaymentMethod: (method) =>
        setPaymentMethods((current) => {
          const exists = current.some((item) => item.id === method.id);
          return exists ? current.map((item) => (item.id === method.id ? method : item)) : [...current, method];
        }),
      deletePaymentMethod: (id) => setPaymentMethods((current) => current.filter((item) => item.id !== id)),
    }),
    [accounts, categories, contactMessages, paymentMethods, siteSettings, subscriptions, user],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}