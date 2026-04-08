import { useEffect, useRef } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Registers this device once on startup so MCP can verify ownership.
 * No polling — just a single upsert into device_presence.
 */
export function useDevicePresence() {
	const { data: deviceInfo } = electronTrpc.auth.getDeviceInfo.useQuery();
	const registeredRef = useRef(false);

	useEffect(() => {
		if (!deviceInfo || registeredRef.current) return;
		registeredRef.current = true;

		apiTrpcClient.device.registerDevice
			.mutate({
				deviceId: deviceInfo.deviceId,
				deviceName: deviceInfo.deviceName,
				deviceType: "desktop",
			})
			.catch(() => {
				registeredRef.current = false;
			});
	}, [deviceInfo]);

	return { deviceInfo, isActive: !!deviceInfo };
}
