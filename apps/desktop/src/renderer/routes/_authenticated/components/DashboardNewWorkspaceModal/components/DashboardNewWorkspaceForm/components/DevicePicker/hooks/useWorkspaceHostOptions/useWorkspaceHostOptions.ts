import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	type OrgService,
	useHostService,
} from "renderer/routes/_authenticated/providers/HostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";

export interface WorkspaceHostOption {
	id: string;
	name: string;
	isCloud: boolean;
}

interface UseWorkspaceHostOptionsResult {
	currentDeviceName: string | null;
	localHostService: OrgService | null;
	otherHosts: WorkspaceHostOption[];
}

export function useWorkspaceHostOptions(): UseWorkspaceHostOptionsResult {
	const collections = useCollections();
	const { services } = useHostService();
	const { data: deviceInfo } = electronTrpc.auth.getDeviceInfo.useQuery();

	const localHostService = services.get(MOCK_ORG_ID) ?? null;

	const { data: accessibleHosts = [] } = useLiveQuery(
		(q) =>
			q
				.from({ hosts: collections.v2Hosts })
				.select(({ hosts }) => ({
					id: hosts.id,
					machineId: hosts.machineId,
					name: hosts.name,
				})),
		[collections],
	);

	const otherHosts = useMemo(
		() =>
			accessibleHosts
				.filter((host) => host.machineId !== deviceInfo?.deviceId)
				.map((host) => ({
					id: host.id,
					name: host.name,
					isCloud: host.machineId == null,
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[accessibleHosts, deviceInfo?.deviceId],
	);

	return {
		currentDeviceName: deviceInfo?.deviceName ?? null,
		localHostService,
		otherHosts,
	};
}
