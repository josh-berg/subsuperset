import { join } from "node:path";
import { BrowserWindow } from "electron";
import { registerRoute } from "lib/window-loader";
import { safeOpenExternal } from "main/lib/safe-url";
import type { WindowProps } from "shared/types";

export function createWindow({ id, ...settings }: WindowProps) {
	const window = new BrowserWindow(settings);

	// Open external URLs in the system browser instead of Electron
	window.webContents.setWindowOpenHandler(({ url }) => {
		void safeOpenExternal(url);
		return { action: "deny" };
	});

	registerRoute({
		id,
		browserWindow: window,
		htmlFile: join(__dirname, "../renderer/index.html"),
	});

	window.on("closed", window.destroy);

	return window;
}
