import { t, type MessageKey } from "../shared/i18n";
import type { LocalModuleDefinition } from "../modules/local/types";

interface ModuleTextKeys {
  name?: MessageKey;
  description: MessageKey;
}
interface ModuleCopy extends ModuleTextKeys {
  filters: ReadonlyMap<string, ModuleTextKeys>;
  scriptDescription?: MessageKey;
}

// Stable module/group IDs select copy; unknown third-party modules retain their text.
// This catalog contains display keys only, never selectors or executable site code.
const PUBLISHED_COPY = new Map<string, ModuleCopy>([
  [
    "hourleaf.local.bilibili-focus",
    {
      name: "moduleCopy.bilibili.name",
      description: "moduleCopy.bilibili.description",
      scriptDescription: "moduleCopy.bilibili.scriptDescription",
      filters: new Map([
        [
          "home-recommendations",
          {
            name: "moduleCopy.filter.home-recommendations.name",
            description: "moduleCopy.bilibili.home-recommendations.description"
          }
        ],
        [
          "dynamic-feed",
          {
            name: "moduleCopy.filter.dynamic-feed.name",
            description: "moduleCopy.bilibili.dynamic-feed.description"
          }
        ],
        [
          "related-videos",
          {
            name: "moduleCopy.filter.related-videos.name",
            description: "moduleCopy.bilibili.related-videos.description"
          }
        ],
        [
          "comments",
          {
            name: "moduleCopy.filter.comments.name",
            description: "moduleCopy.bilibili.comments.description"
          }
        ]
      ])
    }
  ],
  [
    "hourleaf.local.youtube-focus",
    {
      name: "moduleCopy.youtube.name",
      description: "moduleCopy.youtube.description",
      filters: new Map([
        [
          "home-recommendations",
          {
            name: "moduleCopy.filter.home-recommendations.name",
            description: "moduleCopy.bilibili.home-recommendations.description"
          }
        ],
        ["shorts", { name: undefined, description: "moduleCopy.youtube.shorts.description" }],
        [
          "related-videos",
          {
            name: "moduleCopy.filter.related-videos.name",
            description: "moduleCopy.youtube.related-videos.description"
          }
        ],
        [
          "comments",
          {
            name: "moduleCopy.filter.comments.name",
            description: "moduleCopy.youtube.comments.description"
          }
        ]
      ])
    }
  ],
  [
    "hourleaf.local.xiaohongshu-focus",
    {
      name: "moduleCopy.xiaohongshu.name",
      description: "moduleCopy.xiaohongshu.description",
      scriptDescription: "moduleCopy.xiaohongshu.scriptDescription",
      filters: new Map([
        [
          "home-recommendations",
          {
            name: "moduleCopy.filter.home-recommendations.name",
            description: "moduleCopy.xiaohongshu.home-recommendations.description"
          }
        ]
      ])
    }
  ],
  [
    "hourleaf.local.baidu-tieba-focus",
    {
      name: "moduleCopy.baidu-tieba.name",
      description: "moduleCopy.baidu-tieba.description",
      filters: new Map([
        [
          "home-recommendations",
          {
            name: "moduleCopy.filter.home-recommendations.name",
            description: "moduleCopy.baidu-tieba.home-recommendations.description"
          }
        ]
      ])
    }
  ],
  [
    "hourleaf.local.x-focus",
    {
      name: "moduleCopy.x.name",
      description: "moduleCopy.x.description",
      filters: new Map([
        [
          "home-timeline",
          {
            name: "moduleCopy.filter.home-timeline.name",
            description: "moduleCopy.x.home-timeline.description"
          }
        ]
      ])
    }
  ]
]);

/** Read-only projection works for existing imports without changing stored modules. */
export function localizeLocalModuleCopy(definition: LocalModuleDefinition): LocalModuleDefinition {
  const copy = PUBLISHED_COPY.get(definition.id);
  if (!copy) return definition;
  return {
    ...definition,
    name: copy.name ? t(copy.name) : definition.name,
    description:
      definition.filterGroups.length > 0
        ? t(copy.description)
        : copy.scriptDescription && definition.userScript.trim()
          ? t(copy.scriptDescription)
          : definition.description,
    filterGroups: definition.filterGroups.map((group) => {
      const filterCopy = copy.filters.get(group.id);
      return filterCopy
        ? {
            ...group,
            name: filterCopy.name ? t(filterCopy.name) : group.name,
            description: t(filterCopy.description)
          }
        : group;
    })
  };
}
