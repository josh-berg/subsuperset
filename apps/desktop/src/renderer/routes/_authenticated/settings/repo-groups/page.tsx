import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { RepoGroupsSettings } from "./components/RepoGroupsSettings";

export const Route = createFileRoute("/_authenticated/settings/repo-groups/")({
	component: RepoGroupsSettingsPage,
});

function RepoGroupsSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "repo-groups").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <RepoGroupsSettings visibleItems={visibleItems} />;
}
