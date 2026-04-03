import { Search, Settings, Loader2, Shield, BadgeCheck, Users, Upload, MoreVertical } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  useGetExtensions,
  useInstallExtension,
  useInstallExtensionFromZip,
  useUninstallExtension,
  useSetExtensionEnabled,
  useOpenExtensionDetails,
  useUpdateExtension,
} from "@/core/extensions/hooks";
import type { Extension } from "@/types";
import { cn } from "@/core/lib/utils";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { usePluginStore } from "@/plugins";
import { toast } from "@/core/components/ui/sonner";

const ExtensionItem = ({ extension }: { extension: Extension }) => {
  const installMutation = useInstallExtension();
  const uninstallMutation = useUninstallExtension();
  const toggleEnabledMutation = useSetExtensionEnabled();
  const openExtensionDetailsMutation = useOpenExtensionDetails();
  const updateMutation = useUpdateExtension();
  const { pluginErrors } = usePluginStore();

  const error = pluginErrors.find((err) => err.extensionId === extension.id);

  const renderTypeIcon = () => {
    switch (extension.type) {
      case "core":
        return (
          <Shield
            size={16}
            className="text-purple-400 flex-shrink-0"
            title="Core Extension"
          />
        );
      case "verified":
        return (
          <BadgeCheck
            size={16}
            className="text-blue-400 flex-shrink-0"
            title="Verified Extension"
          />
        );
      case "community":
        return (
          <Users
            size={16}
            className="text-orange-400 flex-shrink-0"
            title="Community Extension"
          />
        );
      default:
        return null;
    }
  };

  const typeLabel =
    extension.type === "core"
      ? "Core"
      : extension.type === "verified"
        ? "Verified"
        : extension.type === "community"
          ? "Community"
          : "Extension";

  const typeBadgeClass =
    extension.type === "core"
      ? "bg-purple-500/10 text-purple-300 border-purple-500/20"
      : extension.type === "verified"
        ? "bg-blue-500/10 text-blue-300 border-blue-500/20"
        : extension.type === "community"
          ? "bg-orange-500/10 text-orange-300 border-orange-500/20"
          : "bg-active text-comment border-border";

  const handleToggleEnabled = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    toggleEnabledMutation.mutate({
      extensionId: extension.id,
      enabled: !extension.enabled,
    });
  };

  const renderSettingsMenu = () => (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild onClick={(e) => e.stopPropagation()}>
        <button className="w-6 h-6 hover:bg-active flex justify-center items-center outline-none rounded transition-colors border border-transparent hover:border-border">
          <Settings size={14} className="text-comment hover:text-text transition-colors" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="right"
          align="start"
          sideOffset={12}
          className="bg-editor z-[9999] outline-none min-w-[140px] border border-border rounded-md shadow-lg"
        >
          <DropdownMenu.Item
            onClick={handleToggleEnabled}
            className="w-full px-3 py-2 text-xs text-left text-text hover:bg-active outline-none cursor-pointer rounded-sm mx-1 my-0.5"
          >
            {extension.enabled ? "Disable" : "Enable"}
          </DropdownMenu.Item>
          {extension.type === "community" && (
            <DropdownMenu.Item
              onClick={() => uninstallMutation.mutate(extension.id)}
              className="w-full px-3 py-2 text-xs text-left hover:bg-active outline-none cursor-pointer text-red-400 hover:text-red-300 rounded-sm mx-1 my-0.5"
            >
              Uninstall
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );

  const renderActions = () => {
    if (extension.type === "community") {
      if (!extension.installedPath) {
        if (installMutation.isPending) {
          return (
            <button
              disabled
              className="px-2 py-1 bg-active text-xs flex items-center gap-1 rounded border border-border"
            >
              <Loader2 size={12} className="animate-spin" />
              Installing
            </button>
          );
        }
        return (
          <button
            onClick={() => installMutation.mutate(extension)}
            className="px-2 py-1 bg-accent hover:bg-accent/90 text-bg text-xs rounded transition-colors"
          >
            Install
          </button>
        );
      }
      if (extension.latestVersion) {
        if (updateMutation.isPending) {
          return (
            <button
              disabled
              className="px-2 py-1 bg-active text-xs flex items-center gap-1 rounded border border-border"
            >
              <Loader2 size={12} className="animate-spin" />
              Updating
            </button>
          );
        }
        return (
          <button
            onClick={() => updateMutation.mutate(extension.id)}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
          >
            Update
          </button>
        );
      }
      return renderSettingsMenu();
    }
    return renderSettingsMenu();
  };

  return (
    <div
      className={cn(
        "group relative mx-2 my-2 rounded-xl border border-border bg-panel/80 hover:bg-panel cursor-pointer transition-colors shadow-sm hover:shadow-md",
        "min-h-[90px]",
        !extension.enabled && "opacity-70"
      )}
      onClick={() => openExtensionDetailsMutation.mutate(extension)}
    >
      {/* Main content area */}
      <div className="p-4 pr-14">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{renderTypeIcon()}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className={cn(
                  "text-sm font-semibold truncate mt-0",
                  extension.enabled ? "text-text" : "text-comment"
                )}
              >
                {extension.name}
              </h3>
              <span className="text-xs text-comment flex-shrink-0">v{extension.version}</span>
              <span className={cn("text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border", typeBadgeClass)}>
                {typeLabel}
              </span>
              {extension.latestVersion && (
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-blue-500/20 text-blue-300 bg-blue-500/10">
                  Update available
                </span>
              )}
            </div>
            <p className="text-xs text-comment line-clamp-2 mt-1.5">
              {extension.description}
            </p>
            <div className="flex items-center gap-2 text-xs text-comment mt-2">
              <span>by</span>
              <span className="font-medium text-accent">{extension.author}</span>
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-border text-comment">
                {extension.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions - positioned absolutely to avoid overlap */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {error && (
          <button
            onClick={(e) => { e.stopPropagation(); toast.error(error.error); }}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            Error
          </button>
        )}
        {renderActions()}
      </div>

      {/* Status indicator */}
      {extension.enabled && (
        <div className="absolute bottom-2 right-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
        </div>
      )}
    </div>
  );
};

export const ExtensionBrowser = () => {
  const { data: extensions, isLoading } = useGetExtensions();
  const installFromZip = useInstallExtensionFromZip();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (installFromZip.isError) {
      toast.error((installFromZip.error as Error)?.message || "Failed to install extension");
    }
  }, [installFromZip.isError, installFromZip.error]);

  if (isLoading) return <div>Loading...</div>;

  const filteredExtensions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return extensions || [];
    return (extensions || []).filter((extension) => {
      const haystack = [
        extension.name,
        extension.description,
        extension.author,
        extension.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [extensions, search]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 pt-2">
        <div className="flex items-center gap-2 h-9 px-3 bg-panel border border-border rounded-lg">
          <Search size={14} className="text-comment" />
          <input
            placeholder="Search extensions..."
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-comment/70 truncate min-w-0"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <button
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-active transition-colors text-comment"
                aria-label="Extension actions"
              >
                <MoreVertical size={14} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                side="bottom"
                align="end"
                sideOffset={8}
                className="bg-editor z-[9999] outline-none min-w-[180px] border border-border rounded-md shadow-lg p-1"
              >
                <DropdownMenu.Item
                  onClick={() => installFromZip.mutate()}
                  disabled={installFromZip.isPending}
                  className="w-full px-3 py-2 text-xs text-left text-text hover:bg-active outline-none cursor-pointer rounded-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {installFromZip.isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Upload size={12} />
                  )}
                  {installFromZip.isPending ? "Installing..." : "Install from zip"}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      <div className=" border-border flex-1 flex flex-col mb-1.5 overflow-y-scroll" >
        <div className="bg-bg h-full  border-border  mb-2">
          {filteredExtensions?.map((extension) => <ExtensionItem key={extension.id} extension={extension} />)}
          {!filteredExtensions?.length && (
            <div className="px-4 py-10 text-center text-comment text-sm">
              No extensions found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
