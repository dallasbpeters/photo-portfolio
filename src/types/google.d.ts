/**
 * The parts of Google's browser SDKs this app uses.
 *
 * One declaration rather than one per file. `window.google` is a single global
 * that several Google scripts extend — Identity Services adds `accounts.id` for
 * sign-in and `accounts.oauth2` for tokens, and the Picker adds `picker` — so
 * declaring it separately in each consumer produced two conflicting shapes for
 * the same object, and whichever loaded first won.
 *
 * Hand-written because Google publishes no types for these, and the surface
 * actually used here is small enough to state plainly.
 */

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdApi {
  initialize: (config: {
    auto_select?: boolean;
    callback: (response: GoogleCredentialResponse) => void;
    cancel_on_tap_outside?: boolean;
    client_id: string;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      logo_alignment?: "left" | "center";
      shape?: "rectangular" | "pill";
      size?: "small" | "medium" | "large";
      text?: "signin_with" | "continue_with";
      theme?: "outline" | "filled_blue" | "filled_black";
      type?: "standard" | "icon";
      width?: number;
    }
  ) => void;
}

interface GoogleTokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

interface GoogleOAuth2Api {
  initTokenClient: (config: {
    callback: (response: { access_token?: string; error?: string }) => void;
    client_id: string;
    scope: string;
  }) => GoogleTokenClient;
}

interface GooglePickerDocument {
  id: string;
  mimeType: string;
  name: string;
}

interface GooglePickerResponse {
  action: string;
  docs?: GooglePickerDocument[];
}

interface GooglePickerBuilder {
  addView: (view: unknown) => GooglePickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
  enableFeature: (feature: string) => GooglePickerBuilder;
  setAppId: (appId: string) => GooglePickerBuilder;
  setCallback: (
    callback: (data: GooglePickerResponse) => void
  ) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setTitle: (title: string) => GooglePickerBuilder;
}

/** Chainable, so a view can be configured in one expression. */
interface GoogleDocsView {
  setEnableDrives: (enabled: boolean) => GoogleDocsView;
  setIncludeFolders: (include: boolean) => GoogleDocsView;
  setMimeTypes: (types: string) => GoogleDocsView;
  setMode: (mode: string) => GoogleDocsView;
  setOwnedByMe: (owned: boolean) => GoogleDocsView;
  setSelectFolderEnabled: (enabled: boolean) => GoogleDocsView;
}

interface GooglePickerApi {
  Action: { CANCEL: string; PICKED: string };
  DocsView: new (viewId?: string) => GoogleDocsView;
  DocsViewMode: { GRID: string; LIST: string };
  Feature: { MULTISELECT_ENABLED: string };
  PickerBuilder: new () => GooglePickerBuilder;
  ViewId: { DOCS: string; DOCS_IMAGES: string };
}

interface Window {
  gapi?: { load: (name: string, callback: () => void) => void };
  google?: {
    accounts?: { id?: GoogleIdApi; oauth2?: GoogleOAuth2Api };
    picker?: GooglePickerApi;
  };
}
