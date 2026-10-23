import { app, BrowserWindow } from "electron";
import { env } from "main/env.main";
import { loadReactDevToolsExtension } from "main/lib/extensions";
import { safeOpenExternal } from "main/lib/safe-url";
import { PLATFORM } from "shared/constants";
import { makeAppId } from "shared/utils";
import { ignoreConsoleWarnings } from "../../utils/ignore-console-warnings";
import { openInitialWindow } from "../../utils/open-initial-window";
import { isSameAppDocument } from "../../utils/same-app-document";

ignoreConsoleWarnings(["Manifest version 2 is deprecated"]);

function guardWebContents(
	_: Electron.Event,
	contents: Electron.WebContents,
): void {
	if (contents.getType() === "webview") return;
	// Whatever a <webview> tag asks for, guest content never gets a preload or Node.
	contents.on("will-attach-webview", (_event, webPreferences) => {
		delete webPreferences.preload;
		delete (webPreferences as { preloadURL?: string }).preloadURL;
		webPreferences.nodeIntegration = false;
		webPreferences.nodeIntegrationInSubFrames = false;
		webPreferences.nodeIntegrationInWorker = false;
		webPreferences.contextIsolation = true;
		webPreferences.webSecurity = true;
		webPreferences.allowRunningInsecureContent = false;
	});
	// Fallback only: app windows replace it with their own handler.
	contents.setWindowOpenHandler(({ url }) => {
		void safeOpenExternal(url);
		return { action: "deny" };
	});
	contents.on("will-navigate", (event, url) => {
		// Only the app's own document: any other would get the preload bridge.
		if (isSameAppDocument(contents.getURL(), url)) return;
		event.preventDefault();
		void safeOpenExternal(url);
	});
}

export async function makeAppSetup(
	createWindow: () => Promise<BrowserWindow>,
	restoreWindows?: () => Promise<void>,
) {
	await loadReactDevToolsExtension();

	let window = await openInitialWindow({
		guardWebContents: () => app.on("web-contents-created", guardWebContents),
		restoreWindows,
		getAllWindows: () => BrowserWindow.getAllWindows(),
		createWindow,
	});

	app.on("activate", async () => {
		const windows = BrowserWindow.getAllWindows();

		if (!windows.length) {
			window = await createWindow();
		} else {
			// Show hidden windows (macOS hide-to-tray) or restore minimized ones
			for (window of windows.reverse()) {
				window.show();
				window.focus();
			}
		}
	});

	// macOS: keep the app alive (standard behavior) — tray/dock provide re-entry.
	// Windows/Linux: quit the app UI. Host-services survive via releaseAll()
	// and will be re-adopted on next launch.
	app.on("window-all-closed", () => !PLATFORM.IS_MAC && app.quit());

	return window;
}

PLATFORM.IS_LINUX && app.disableHardwareAcceleration();

// macOS Sequoia+: occluded window throttling can corrupt GPU compositor layers
if (PLATFORM.IS_MAC) {
	app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
}

PLATFORM.IS_WINDOWS &&
	app.setAppUserModelId(
		env.NODE_ENV === "development" ? process.execPath : makeAppId(),
	);

app.commandLine.appendSwitch("force-color-profile", "srgb");

// Only expose CDP in development when a port is explicitly configured.
const cdpPort =
	env.NODE_ENV === "development"
		? process.env.DESKTOP_AUTOMATION_PORT
		: undefined;
if (cdpPort) {
	app.commandLine.appendSwitch("remote-debugging-port", cdpPort);
	app.commandLine.appendSwitch("remote-allow-origins", "*");
}
