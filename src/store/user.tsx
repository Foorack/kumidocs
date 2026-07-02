import { ApiError, getMe, setAuthEmail } from "@/lib/api";
import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { PageTemplateMap } from "@/lib/page";
import type { SlideThemeMap } from "@/lib/slide";
import type { User } from "@/lib/types";
import useMountEffect from "@/hooks/use-mount-effect";

const HTTP_UNAUTHORIZED = 401;

interface UserContextValue {
  user?: User;
  loading: boolean;
  needsEmailSetup: boolean;
  sidebarDefaultDepth: number;
  slideThemes: SlideThemeMap;
  pageTemplates: PageTemplateMap;
  instanceName: string;
  autoSaveDelay: number;
  headSha: string;
  refreshUser: () => Promise<void>;
  setEmailAndRefetch: (email: string) => void;
}

const UserContext = createContext<UserContextValue>({
  autoSaveDelay: 5000,
  headSha: "",
  instanceName: "KumiDocs",
  loading: true,
  needsEmailSetup: false,
  pageTemplates: {},
  refreshUser: async () => {
    /* noop until provider mounts */
  },
  setEmailAndRefetch: () => {
    globalThis.location.reload();
  },
  sidebarDefaultDepth: 0,
  slideThemes: {},
});

interface FetchMeResult {
  user?: User;
  sidebarDefaultDepth: number;
  slideThemes: SlideThemeMap;
  pageTemplates: PageTemplateMap;
  instanceName: string;
  autoSaveDelay: number;
  headSha: string;
  needs401: boolean;
}

const fetchMe = async (): Promise<FetchMeResult> => {
  try {
    const data = await getMe();
    const {
      id,
      email,
      name,
      displayName,
      canEdit,
      slideThemes: themeData,
      pageTemplates: pageData,
      sidebarDefaultDepth,
      autoSaveDelay: rawDelay,
      headSha: rawSha,
      instanceName: rawName,
    } = data;
    const user: User = { canEdit, displayName, email, id, name };
    return {
      autoSaveDelay: rawDelay !== undefined && rawDelay !== 0 ? rawDelay : 5000,
      headSha: rawSha ?? "",
      instanceName: rawName ?? "KumiDocs",
      needs401: false,
      pageTemplates: pageData ?? {},
      sidebarDefaultDepth: sidebarDefaultDepth ?? 2,
      slideThemes: themeData ?? {},
      user,
    };
  } catch (error: unknown) {
    const needs401 = error instanceof ApiError && error.status === HTTP_UNAUTHORIZED;
    return {
      autoSaveDelay: 5000,
      headSha: "",
      instanceName: "KumiDocs",
      needs401,
      pageTemplates: {},
      sidebarDefaultDepth: 0,
      slideThemes: {},
    };
  }
};

const UserProvider = (allProps: { children: ReactNode }): JSX.Element => {
  const { children } = allProps;
  const [user, setUser] = useState<User | undefined>();
  const [loading, setLoading] = useState(true);
  const [needsEmailSetup, setNeedsEmailSetup] = useState(false);
  const [slideThemes, setSlideThemes] = useState<SlideThemeMap>({});
  const [pageTemplates, setPageTemplates] = useState<PageTemplateMap>({});
  const [sidebarDefaultDepth, setSidebarDefaultDepth] = useState(0);
  const [instanceName, setInstanceName] = useState("KumiDocs");
  const [autoSaveDelay, setAutoSaveDelay] = useState(5000);
  const [headSha, setHeadSha] = useState("");

  useMountEffect(() => {
    void (async (): Promise<void> => {
      try {
        const result = await fetchMe();
        setUser(result.user);
        setSlideThemes(result.slideThemes);
        setPageTemplates(result.pageTemplates);
        setSidebarDefaultDepth(result.sidebarDefaultDepth);
        setNeedsEmailSetup(result.needs401);
        setInstanceName(result.instanceName);
        setAutoSaveDelay(result.autoSaveDelay);
        setHeadSha(result.headSha);
        setLoading(false);
      } catch {
        setLoading(false);
      }
    })();
  });

  const refreshUser = useCallback(async (): Promise<void> => {
    try {
      const result = await fetchMe();
      setUser(result.user);
      setSlideThemes(result.slideThemes);
      setPageTemplates(result.pageTemplates);
      setSidebarDefaultDepth(result.sidebarDefaultDepth);
      setNeedsEmailSetup(result.needs401);
      setInstanceName(result.instanceName);
      setAutoSaveDelay(result.autoSaveDelay);
      setHeadSha(result.headSha);
    } catch {
      // keep current state
    }
  }, []);

  const setEmailAndRefetch = useCallback(async (email: string): Promise<void> => {
    const trimmed = email.trim().toLowerCase();
    // Basic validation: must look like an email address.
    // The UI dialog also validates, but this guard prevents storing
    // garbage if called programmatically.
    if (!trimmed.includes("@") || trimmed.startsWith("@") || trimmed.endsWith("@")) {
      return;
    }
    try {
      const data = await setAuthEmail(trimmed);
      const {
        id,
        email: userEmail,
        name,
        displayName,
        canEdit,
        slideThemes: themeData,
        pageTemplates: pageData,
        sidebarDefaultDepth: fetchedDepth,
      } = data;
      const parsedUser: User = { canEdit, displayName, email: userEmail, id, name };
      setUser(parsedUser);
      setSlideThemes(themeData ?? {});
      setPageTemplates(pageData ?? {});
      setSidebarDefaultDepth(fetchedDepth ?? 2);
      setNeedsEmailSetup(false);
    } catch {
      // Server rejected the email; keep the dialog open
    }
  }, []);

  return (
    <UserContext.Provider
      value={{
        autoSaveDelay,
        headSha,
        instanceName,
        loading,
        needsEmailSetup,
        pageTemplates,
        refreshUser,
        setEmailAndRefetch,
        sidebarDefaultDepth,
        slideThemes,
        user,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

const useUser = (): UserContextValue => useContext(UserContext);

export type { UserContextValue };
export { UserProvider, useUser };
