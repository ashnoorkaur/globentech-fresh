import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewErrorEvent } from "react-native-webview/lib/WebViewTypes";
import { MenuItem } from "../constants/role-menus";
import { getApiBaseUrl } from "../lib/api-client";
import { useAppTheme } from "../lib/theme";
import { getWebRoutes } from "../lib/web-routes";
import { RoleMenuModal } from "./role-menu-modal";
import { TopStripNav } from "./top-strip-nav";

type PhpWebViewPageProps = {
  path: string;
  role?: string;
  menuItems?: MenuItem[];
  activeKey?: string;
  onLogout?: () => void;
  showAppShell?: boolean;
};

const normalizePath = (path: string) =>
  path.startsWith("/") ? path : `/${path}`;

const WEBVIEW_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

const NAVIGATION_BRIDGE_JS = `
  (function() {
    // Inject viewport meta tag for proper mobile rendering
    if (!document.querySelector('meta[name="viewport"]')) {
      var viewport = document.createElement('meta');
      viewport.name = 'viewport';
      viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5';
      document.head.appendChild(viewport);
    }
    
    // Add safe area and overflow handling to body
    if (document.body) {
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.overflowX = 'hidden';
    }

    // Hide website-level nav/header so the app-level shell is the single navigation UI.
    var hideWebsiteChrome = function() {
      var selectors = [
        'header',
        '.header',
        '#header',
        'nav',
        '.navbar',
        '#navbar',
        '.top-nav',
        '.topbar',
        '.site-header',
        '.menu-toggle',
        '.hamburger',
        '.mobile-menu-toggle'
      ];

      for (var i = 0; i < selectors.length; i += 1) {
        try {
          var nodes = document.querySelectorAll(selectors[i]);
          for (var j = 0; j < nodes.length; j += 1) {
            nodes[j].style.display = 'none';
          }
        } catch (error) {
          // no-op
        }
      }
    };

    var resolveUrl = function(target) {
      if (!target) return target;
      if (target.match(/^(javascript:|mailto:|tel:|data:)/i)) return target;
      try {
        return new URL(target, window.location.href).toString();
      } catch (error) {
        return target;
      }
    };

    var logPageDebugInfo = function() {
      var bodyText = document.body ? document.body.innerText : '';
      var contentLength = bodyText ? bodyText.trim().length : 0;
      if (contentLength === 0) {
        console.warn('[GlobenTech Bridge] Page appears blank:', window.location.href);
      }
    };
    
    var processLinks = function() {
      var links = document.querySelectorAll('a[href]');
      for (var i = 0; i < links.length; i += 1) {
        var link = links[i];
        try {
          // Always rewrite target="_blank" to _self to stay in WebView
          if (link.getAttribute('target') === '_blank') {
            link.setAttribute('target', '_self');
          }
          
          var href = link.getAttribute('href');
          if (href && !href.match(/^#/)) {
            var resolved = resolveUrl(href);
            link.href = resolved;
          }
        } catch (e) {
          console.log('Error processing link:', e);
        }
      }
      
      var forms = document.querySelectorAll('form[action]');
      for (var i = 0; i < forms.length; i += 1) {
        var form = forms[i];
        try {
          var action = form.getAttribute('action');
          if (action && !action.match(/^javascript:/i)) {
            var resolved = resolveUrl(action);
            form.action = resolved;
          }
        } catch (e) {
          console.log('Error processing form:', e);
        }
      }
      logPageDebugInfo();
    };
    
    processLinks();
    hideWebsiteChrome();
    document.addEventListener('DOMContentLoaded', processLinks);
    document.addEventListener('load', processLinks);
    document.addEventListener('DOMContentLoaded', hideWebsiteChrome);
    document.addEventListener('load', hideWebsiteChrome);
    document.addEventListener('DOMContentLoaded', logPageDebugInfo);
    document.addEventListener('load', logPageDebugInfo);
    var observer = new MutationObserver(processLinks);
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

    var reportPageState = function() {
      try {
        if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
          return;
        }
        var textContent = document.body ? (document.body.innerText || '') : '';
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'page-state',
          href: window.location.href,
          title: document.title || '',
          textSample: textContent.slice(0, 2500)
        }));
      } catch (error) {
        // No-op
      }
    };

    setTimeout(reportPageState, 400);
    setTimeout(reportPageState, 1200);
  })();
  true;
`;

const PAGE_CHECK_JS = `
  (function() {
    try {
      if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
        return true;
      }
      var textContent = document.body ? (document.body.innerText || '') : '';
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'page-check',
        href: window.location.href,
        title: document.title || '',
        textSample: textContent.slice(0, 8000)
      }));
    } catch (error) {
      // no-op
    }
    return true;
  })();
`;

const isLocalHost = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1";

const rewriteToRuntimeHost = (targetUrl: string, runtimeBaseUrl: string) => {
  try {
    if (!/^https?:\/\//i.test(targetUrl)) {
      return null;
    }

    const target = new URL(targetUrl);
    const runtime = new URL(runtimeBaseUrl);

    if (!isLocalHost(target.hostname)) {
      return null;
    }

    target.protocol = runtime.protocol;
    target.hostname = runtime.hostname;
    target.port = runtime.port;

    return target.toString();
  } catch {
    return null;
  }
};

const resolveRelativeRequestUrl = (requestUrl: string, baseUrl: string) => {
  try {
    if (/^https?:\/\//i.test(requestUrl)) {
      return requestUrl;
    }

    if (/^(about:blank|javascript:|data:|mailto:|tel:)/i.test(requestUrl)) {
      return requestUrl;
    }

    return new URL(requestUrl, baseUrl).toString();
  } catch {
    return requestUrl;
  }
};

const ensureProjectBasePath = (targetUrl: string, runtimeBaseUrl: string) => {
  try {
    const target = new URL(targetUrl);
    const runtime = new URL(runtimeBaseUrl);

    if (target.origin !== runtime.origin) {
      return null;
    }

    const runtimePath = runtime.pathname.replace(/\/+$/, "");
    if (!runtimePath || runtimePath === "/") {
      return null;
    }

    if (
      target.pathname === runtimePath ||
      target.pathname.startsWith(`${runtimePath}/`)
    ) {
      return null;
    }

    if (!target.pathname.startsWith("/")) {
      return null;
    }

    target.pathname = `${runtimePath}${target.pathname}`.replace(/\/+/g, "/");
    return target.toString();
  } catch {
    return null;
  }
};

const isNonGetRequest = (method?: string) => {
  if (!method) return false;
  return method.toUpperCase() !== "GET";
};

const mapBackendUrlToNativeRoute = (requestUrl: string, baseUrl: string) => {
  try {
    const parsed = new URL(requestUrl, baseUrl);
    const path = parsed.pathname.toLowerCase();
    const tab = (parsed.searchParams.get("tab") || "").toLowerCase();

    if (path.endsWith("/contact.php")) {
      return "/customer-contact";
    }

    if (path.endsWith("/admin.php")) {
      if (tab === "approvals") return "/admin-approvals";
      if (tab === "users") return "/admin-users";
      if (tab === "equipment") return "/admin-equipment";
      if (tab === "reports") return "/admin-reports";
      if (tab === "samples") return "/technician-samples";
    }

    return null;
  } catch {
    return null;
  }
};

export function PhpWebViewPage({
  path,
  role,
  menuItems,
  activeKey,
  onLogout,
  showAppShell = true,
}: PhpWebViewPageProps) {
  const theme = useAppTheme();
  const webViewRef = useRef<WebView>(null);
  const hasTriedFallbackRef = useRef(false);
  const hasHandledFatalContentRef = useRef(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const runtimeBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const fallbackUri = useMemo(
    () => `${runtimeBaseUrl}${normalizePath(getWebRoutes().home)}`,
    [runtimeBaseUrl],
  );
  const sourceUri = useMemo(
    () => `${runtimeBaseUrl}${normalizePath(path)}`,
    [path, runtimeBaseUrl],
  );
  const [currentUri, setCurrentUri] = useState(sourceUri);

  useEffect(() => {
    setCurrentUri(sourceUri);
    hasTriedFallbackRef.current = false;
    hasHandledFatalContentRef.current = false;
  }, [sourceUri]);

  const handleError = (event: WebViewErrorEvent) => {
    const { code, description, domain } = event.nativeEvent;
    setErrorText(
      `Could not load ${sourceUri}\n${domain} (${code}): ${description}`,
    );
  };

  const retryLoad = () => {
    setErrorText(null);
    webViewRef.current?.reload();
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {showAppShell ? (
        <TopStripNav
          onOpenMenu={() => {
            if (menuItems?.length) {
              setMenuVisible(true);
            }
          }}
          role={role}
          colors={theme.colors}
        />
      ) : null}

      {
        <WebView
          ref={webViewRef}
          source={{ uri: currentUri }}
          injectedJavaScript={PAGE_CHECK_JS}
          userAgent={WEBVIEW_USER_AGENT}
          originWhitelist={["*"]}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          javaScriptEnabled
          javaScriptCanOpenWindowsAutomatically
          domStorageEnabled
          setSupportMultipleWindows={false}
          injectedJavaScriptBeforeContentLoaded={NAVIGATION_BRIDGE_JS}
          startInLoadingState
          onShouldStartLoadWithRequest={(request) => {
            if (!request.url || request.url.startsWith("about:blank")) {
              return true;
            }

            const nativeRoute = mapBackendUrlToNativeRoute(
              request.url,
              currentUri,
            );
            if (nativeRoute) {
              router.push(nativeRoute as never);
              return false;
            }

            // Never intercept non-GET requests to preserve PHP form submissions (login/register).
            const requestMethod = (
              request as { method?: string; navigationType?: string }
            ).method;
            if (isNonGetRequest(requestMethod)) {
              return true;
            }

            const resolvedRequestUrl = resolveRelativeRequestUrl(
              request.url,
              currentUri,
            );

            if (resolvedRequestUrl !== request.url) {
              setCurrentUri(resolvedRequestUrl);
              return false;
            }

            const rewritten = rewriteToRuntimeHost(
              resolvedRequestUrl,
              runtimeBaseUrl,
            );
            if (rewritten && rewritten !== resolvedRequestUrl) {
              setCurrentUri(rewritten);
              return false;
            }

            const projectScoped = ensureProjectBasePath(
              rewritten ?? resolvedRequestUrl,
              runtimeBaseUrl,
            );
            if (
              projectScoped &&
              projectScoped !== (rewritten ?? resolvedRequestUrl)
            ) {
              setCurrentUri(projectScoped);
              return false;
            }

            return true;
          }}
          onError={handleError}
          onMessage={(event) => {
            try {
              const payload = JSON.parse(event.nativeEvent.data) as {
                type?: string;
                textSample?: string;
                href?: string;
              };
              if (
                payload.type !== "page-state" &&
                payload.type !== "page-check"
              ) {
                return;
              }

              const sample = (payload.textSample || "").toLowerCase();
              const hasFatalErrorText =
                sample.includes("fatal error") ||
                sample.includes("uncaught error") ||
                sample.includes("failed opening required") ||
                sample.includes("failed to open stream") ||
                sample.includes("no such file or directory") ||
                sample.includes("warning: require_once") ||
                sample.includes("require_once(") ||
                sample.includes("stack trace:") ||
                sample.includes("vendor/autoload.php") ||
                sample.includes("autoload.php") ||
                sample.includes("classes/email.php") ||
                sample.includes("classes\\email.php");

              if (hasFatalErrorText && !hasHandledFatalContentRef.current) {
                hasHandledFatalContentRef.current = true;

                if (currentUri !== fallbackUri) {
                  setErrorText(
                    "Backend page error detected. Redirected to a stable page so navigation stays usable.",
                  );
                  setCurrentUri(fallbackUri);
                  return;
                }

                setErrorText(
                  "Backend returned a PHP fatal error on this page. Please use Home/Login while backend dependencies are fixed.",
                );
              }
            } catch {
              // Ignore parse errors from non-json postMessage payloads.
            }
          }}
          onHttpError={(event) => {
            const { statusCode } = event.nativeEvent;
            if (!hasTriedFallbackRef.current && currentUri !== fallbackUri) {
              hasTriedFallbackRef.current = true;
              setCurrentUri(fallbackUri);
              return;
            }
            setErrorText(`HTTP ${statusCode} while loading ${currentUri}`);
          }}
          onLoadStart={() => {
            setErrorText(null);
          }}
          renderLoading={() => (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          )}
        />
      }

      {showAppShell && menuItems?.length && activeKey ? (
        <RoleMenuModal
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          items={menuItems}
          activeKey={activeKey}
          colors={theme.colors}
          role={role}
          onLogout={onLogout}
        />
      ) : null}

      {errorText ? (
        <View style={styles.errorWrap}>
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>
            Unable to connect to backend
          </Text>
          <Text style={[styles.errorText, { color: theme.colors.text }]}>
            {errorText}
          </Text>
          <View style={styles.actionRow}>
            <Pressable
              onPress={retryLoad}
              style={[
                styles.retryButton,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Text style={styles.retryLabel}>Retry</Text>
            </Pressable>
            <Pressable
              onPress={() => setCurrentUri(fallbackUri)}
              style={[
                styles.retryButton,
                { backgroundColor: theme.colors.secondary },
              ]}
            >
              <Text style={styles.retryLabel}>Home</Text>
            </Pressable>
            <Pressable
              onPress={() => router.replace("/login")}
              style={[
                styles.retryButton,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Text style={styles.retryLabel}>Login</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  retryButton: {
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryLabel: {
    color: "#ffffff",
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "center",
  },
});
