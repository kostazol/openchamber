import React from 'react';
import { cn, fuzzyMatch } from '@/lib/utils';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessionMessages } from '@/sync/sync-context';
import { useCommandsStore } from '@/stores/useCommandsStore';
import { useSkillsStore } from '@/stores/useSkillsStore';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Icon } from "@/components/icon/Icon";
import { useI18n } from '@/lib/i18n';

type CommandSource = 'openchamber' | 'opencode';
type CommandCategoryFilter = 'all' | 'general' | 'skill' | 'system' | 'openchamber' | 'user' | 'project' | 'untagged';

export interface CommandInfo {
  id: string;
  name: string;
  source: CommandSource;
  description?: string;
  agent?: string;
  model?: string;
  isBuiltIn?: boolean;
  isOpenChamber?: boolean;
  isSkill?: boolean;
  scope?: string;
}

export interface CommandAutocompleteHandle {
  handleKeyDown: (key: string) => void;
}

type TranslateFn = ReturnType<typeof useI18n>['t'];

const hasCommandTag = (command: CommandInfo, filter: Exclude<CommandCategoryFilter, 'all'>): boolean => {
  if (filter === 'skill') {
    return command.isSkill === true;
  }

  if (filter === 'general') {
    return command.agent === 'general';
  }

  if (filter === 'system') {
    return command.isBuiltIn === true;
  }

  if (filter === 'openchamber') {
    return command.isOpenChamber === true;
  }

  if (filter === 'user') {
    return command.scope === 'user';
  }

  if (filter === 'project') {
    return command.scope === 'project';
  }

  return command.isSkill !== true && command.isBuiltIn !== true && command.isOpenChamber !== true && command.scope !== 'user' && command.scope !== 'project' && command.agent !== 'general';
};

const matchesCommandCategory = (command: CommandInfo, filter: CommandCategoryFilter): boolean => {
  if (filter === 'all') {
    return true;
  }

  return hasCommandTag(command, filter);
};

interface CommandTagBadge {
  id: Exclude<CommandCategoryFilter, 'all'>;
  label: string;
  className?: string;
  style?: React.CSSProperties;
}

const getCommandTagBadges = (command: CommandInfo, t: TranslateFn): CommandTagBadge[] => {
  const badges: CommandTagBadge[] = [];

  if (command.isSkill === true) {
    badges.push({ id: 'skill', label: t('chat.commandAutocomplete.badge.skill'), className: 'bg-[var(--status-info-background)] text-[var(--status-info)] border-[var(--status-info-border)]' });
  }

  if (command.agent === 'general') {
    badges.push({ id: 'general', label: t('chat.commandAutocomplete.tabs.general'), className: 'bg-[var(--surface-subtle)] text-[var(--surface-foreground)] border-[var(--interactive-border)]' });
  }

  if (command.isOpenChamber === true) {
    badges.push({
      id: 'openchamber',
      label: 'OpenChamber',
      className: 'px-1.5 py-1',
      style: {
        backgroundColor: 'color-mix(in srgb, var(--primary-base) 14%, transparent)',
        color: 'var(--primary-base)',
        borderColor: 'color-mix(in srgb, var(--primary-base) 28%, transparent)',
      },
    });
  }

  if (command.isBuiltIn === true) {
    badges.push({ id: 'system', label: t('chat.commandAutocomplete.badge.system'), className: 'bg-[var(--status-warning-background)] text-[var(--status-warning)] border-[var(--status-warning-border)]' });
  }

  if (command.scope === 'project') {
    badges.push({ id: 'project', label: command.scope, className: 'bg-[var(--status-info-background)] text-[var(--status-info)] border-[var(--status-info-border)]' });
  } else if (command.scope === 'user') {
    badges.push({ id: 'user', label: command.scope, className: 'bg-[var(--status-success-background)] text-[var(--status-success)] border-[var(--status-success-border)]' });
  }

  return badges;
};

interface CommandAutocompleteProps {
  searchQuery: string;
  onCommandSelect: (command: CommandInfo, options?: { dismissKeyboard?: boolean }) => void;
  onClose: () => void;
  style?: React.CSSProperties;
}

export const CommandAutocomplete = React.forwardRef<CommandAutocompleteHandle, CommandAutocompleteProps>(({ 
  searchQuery,
  onCommandSelect,
  onClose,
  style,
}, ref) => {
  const { t } = useI18n();
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const getDirectoryForSession = useSessionUIStore((state) => state.getDirectoryForSession);
  const sessionMessages = useSessionMessages(currentSessionId ?? '');
  const hasMessagesInCurrentSession = sessionMessages.length > 0;
  const hasSession = Boolean(currentSessionId);
  const hasNewSessionDraft = useSessionUIStore((state) => Boolean(state.newSessionDraft?.open));
  const canStartSessionCommand = hasSession || hasNewSessionDraft;

  const [commands, setCommands] = React.useState<CommandInfo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const commandsWithMetadata = useCommandsStore((s) => s.commands);
  const refreshCommands = useCommandsStore((s) => s.loadCommands);
  const skills = useSkillsStore((s) => s.skills);
  const refreshSkills = useSkillsStore((s) => s.loadSkills);
  const [commandCategoryFilter, setCommandCategoryFilter] = React.useState<CommandCategoryFilter>('all');
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const ignoreClickRef = React.useRef(false);
  const pointerStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const pointerMovedRef = React.useRef(false);

  const commandCategoryOptions = React.useMemo(() => ([
    { id: 'all' as const, label: t('chat.commandAutocomplete.tabs.all') },
    { id: 'general' as const, label: t('chat.commandAutocomplete.tabs.general') },
    { id: 'openchamber' as const, label: t('chat.commandAutocomplete.tabs.openchamber') },
    { id: 'project' as const, label: t('chat.commandAutocomplete.tabs.project') },
    { id: 'skill' as const, label: t('chat.commandAutocomplete.tabs.skill') },
    { id: 'system' as const, label: t('chat.commandAutocomplete.tabs.system') },
    { id: 'untagged' as const, label: t('chat.commandAutocomplete.tabs.untagged') },
    { id: 'user' as const, label: t('chat.commandAutocomplete.tabs.user') },
  ]).sort((a, b) => a.label.localeCompare(b.label)), [t]);

  const currentSessionDirectory = React.useMemo(() => {
    if (!currentSessionId) {
      return null;
    }

    return getDirectoryForSession(currentSessionId);
  }, [currentSessionId, getDirectoryForSession]);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || !containerRef.current) {
        return;
      }
      if (containerRef.current.contains(target)) {
        return;
      }
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [onClose]);

  React.useEffect(() => {
    // Force refresh to get latest project context when mounting
    void refreshCommands(currentSessionDirectory);
    void refreshSkills();
  }, [currentSessionDirectory, refreshCommands, refreshSkills]);

  React.useEffect(() => {
    const loadCommands = async () => {
      setLoading(true);
      try {
        const skillNames = new Set(skills.map((skill) => skill.name));
        const customCommands: CommandInfo[] = commandsWithMetadata.map((cmd, index) => ({
          id: `opencode:${cmd.scope ?? 'global'}:${cmd.name}:${cmd.agent ?? ''}:${cmd.model ?? ''}:${index}`,
          name: cmd.name,
          source: 'opencode',
          description: cmd.description,
          agent: cmd.agent ?? undefined,
          model: cmd.model ?? undefined,
          isBuiltIn: cmd.name === 'init' || cmd.name === 'review',
          isSkill: skillNames.has(cmd.name),
          scope: cmd.scope,
        }));

        const builtInCommands: CommandInfo[] = [
          ...(hasSession && !hasMessagesInCurrentSession
            ? [{ id: 'openchamber:init', name: 'init', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.initDescription'), isBuiltIn: true }]
            : []
          ),
          ...(hasSession  // Show when session exists, not when hasMessages
            ? [
                { id: 'openchamber:undo', name: 'undo', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.undoDescription'), isBuiltIn: true },
                { id: 'openchamber:redo', name: 'redo', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.redoDescription'), isBuiltIn: true },
                { id: 'openchamber:timeline', name: 'timeline', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.timelineDescription'), isBuiltIn: true },
              ]
            : []
          ),
          { id: 'openchamber:compact', name: 'compact', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.compactDescription'), isBuiltIn: true },
          ...(hasSession
            ? [{ id: 'openchamber:summary', name: 'summary', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.summaryDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:workspace-review', name: 'workspace-review', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.workspaceReviewDescription'), isOpenChamber: true }]
            : []
          ),
        ];
        const allCommands = [...builtInCommands, ...customCommands];

        const allowInitCommand = !hasMessagesInCurrentSession;
        const filtered = (searchQuery
          ? allCommands.filter(cmd =>
              fuzzyMatch(cmd.name, searchQuery) ||
              (cmd.description && fuzzyMatch(cmd.description, searchQuery))
            )
          : allCommands)
          .filter(cmd => allowInitCommand || cmd.name !== 'init')
          .filter(cmd => matchesCommandCategory(cmd, commandCategoryFilter));

        filtered.sort((a, b) => {
          const aStartsWith = a.name.toLowerCase().startsWith(searchQuery.toLowerCase());
          const bStartsWith = b.name.toLowerCase().startsWith(searchQuery.toLowerCase());
          if (aStartsWith && !bStartsWith) return -1;
          if (!aStartsWith && bStartsWith) return 1;
          return a.name.localeCompare(b.name);
        });

        setCommands(filtered);
      } catch {

        const allowInitCommand = !hasMessagesInCurrentSession;
        const builtInCommands: CommandInfo[] = [
          ...(hasSession && !hasMessagesInCurrentSession
            ? [{ id: 'openchamber:init', name: 'init', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.initDescription'), isBuiltIn: true }]
            : []
          ),
          ...(hasSession  // Show when session exists, not when hasMessages
            ? [
                { id: 'openchamber:undo', name: 'undo', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.undoDescription'), isBuiltIn: true },
                { id: 'openchamber:redo', name: 'redo', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.redoDescription'), isBuiltIn: true },
                { id: 'openchamber:timeline', name: 'timeline', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.timelineDescription'), isBuiltIn: true },
              ]
            : []
          ),
          { id: 'openchamber:compact', name: 'compact', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.compactDescription'), isBuiltIn: true },
          ...(hasSession
            ? [{ id: 'openchamber:summary', name: 'summary', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.summaryDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:workspace-review', name: 'workspace-review', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.workspaceReviewDescription'), isOpenChamber: true }]
            : []
          ),
        ];

        const filtered = (searchQuery
          ? builtInCommands.filter(cmd =>
              fuzzyMatch(cmd.name, searchQuery) ||
              (cmd.description && fuzzyMatch(cmd.description, searchQuery))
            )
          : builtInCommands)
          .filter(cmd => allowInitCommand || cmd.name !== 'init')
          .filter(cmd => matchesCommandCategory(cmd, commandCategoryFilter));

        setCommands(filtered);
      } finally {
        setLoading(false);
      }
    };

    loadCommands();
  }, [searchQuery, hasMessagesInCurrentSession, hasSession, canStartSessionCommand, commandCategoryFilter, commandsWithMetadata, skills, t]);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [commands]);

  React.useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }, [selectedIndex]);

  React.useImperativeHandle(ref, () => ({
    handleKeyDown: (key: string) => {
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const currentIndex = commandCategoryOptions.findIndex((option) => option.id === commandCategoryFilter);
        if (currentIndex >= 0) {
          const nextIndex = key === 'ArrowRight'
            ? (currentIndex + 1) % commandCategoryOptions.length
            : (currentIndex - 1 + commandCategoryOptions.length) % commandCategoryOptions.length;
          setCommandCategoryFilter(commandCategoryOptions[nextIndex].id);
        }
        return;
      }

      const total = commands.length;
      if (key === 'Escape') {
        onClose();
        return;
      }

      if (total === 0) {
        return;
      }

      if (key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % total);
        return;
      }

      if (key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev - 1 + total) % total);
        return;
      }

      if (key === 'Enter' || key === 'Tab') {
        const safeIndex = ((selectedIndex % total) + total) % total;
        const command = commands[safeIndex];
        if (command) {
          onCommandSelect(command);
        }
      }
    }
  }), [commands, selectedIndex, onClose, onCommandSelect, commandCategoryFilter, commandCategoryOptions]);

  const getCommandIcon = (command: CommandInfo) => {

    switch (command.name) {
      case 'init':
        return <Icon name="file" className="h-3.5 w-3.5 text-green-500" />;
      case 'undo':
        return <Icon name="arrow-go-back" className="h-3.5 w-3.5 text-orange-500" />;
      case 'redo':
        return <Icon name="arrow-go-forward" className="h-3.5 w-3.5 text-orange-500" />;
      case 'timeline':
        return <Icon name="time" className="h-3.5 w-3.5" />;
      case 'compact':
        return <Icon name="scissors" className="h-3.5 w-3.5 text-purple-500" />;
      case 'review':
        return <Icon name="search-eye" className="h-3.5 w-3.5 text-blue-500" />;
      case 'test':
      case 'build':
      case 'run':
        return <Icon name="terminal-box" className="h-3.5 w-3.5 text-cyan-500" />;
      default:
        if (command.isBuiltIn) {
          return <Icon name="flashlight" className="h-3.5 w-3.5 text-yellow-500" />;
        }
        return <Icon name="command" className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute z-[100] min-w-0 w-full max-w-[450px] h-64 max-h-64 bg-background border-2 border-border/60 rounded-xl shadow-none bottom-full mb-2 left-0 flex flex-col"
      style={style}
    >
      <div className="px-2 pt-2 pb-1 border-b border-border/60">
        <div className="relative">
          <button
            type="button"
            className={cn(
              'text-foreground border border-border/80 appearance-none flex h-9 w-full min-w-0 rounded-lg bg-transparent px-3 py-1 outline-none',
              'hover:border-input focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:border-primary/70',
              'flex items-center gap-2 text-left'
            )}
            onClick={() => setIsFilterOpen((value) => !value)}
            aria-expanded={isFilterOpen}
          >
            <Icon name="command" className="h-4 w-4 opacity-70" />
            <span className="min-w-0 flex-1 truncate typography-ui-label font-medium">
              {t(`chat.commandAutocomplete.tabs.${commandCategoryFilter}`)}
            </span>
            <Icon name="arrow-down-s" className="size-4 opacity-50" />
          </button>
          {isFilterOpen ? (
            <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 overflow-hidden rounded-xl border border-border/80 bg-[var(--surface-elevated)] p-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8),inset_0_0_0_1px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.10),0_1px_2px_-0.5px_rgba(0,0,0,0.08),0_4px_8px_-2px_rgba(0,0,0,0.08),0_12px_20px_-4px_rgba(0,0,0,0.08)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),inset_0_0_0_1px_rgba(255,255,255,0.08),0_0_0_1px_rgba(0,0,0,0.36),0_1px_1px_-0.5px_rgba(0,0,0,0.22),0_3px_3px_-1.5px_rgba(0,0,0,0.20),0_6px_6px_-3px_rgba(0,0,0,0.16)]">
              {commandCategoryOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left typography-ui-label outline-none',
                    commandCategoryFilter === option.id
                      ? 'bg-interactive-selection text-interactive-selection-foreground'
                      : 'text-foreground hover:bg-interactive-hover'
                  )}
                  onClick={() => {
                    setCommandCategoryFilter(option.id);
                    setIsFilterOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {commandCategoryFilter === option.id ? <Icon name="check" className="size-3.5" /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <ScrollableOverlay outerClassName="flex-1 min-h-0" className="px-0 pb-2">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Icon name="refresh" className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div>
            {commands.map((command, index) => {
              const tagBadges = getCommandTagBadges(command, t);

              const visibleTagBadges = tagBadges.filter((badge) => badge.id !== commandCategoryFilter);
                
              return (
                <div
                  key={command.id}
                  ref={(el) => { itemRefs.current[index] = el; }}
                  className={cn(
                    "flex items-start gap-2 px-3 py-2 cursor-pointer rounded-lg",
                    index === selectedIndex && "bg-interactive-selection"
                  )}
                  onPointerDown={(event) => {
                    if (event.pointerType !== 'touch') {
                      return;
                    }
                    pointerStartRef.current = { x: event.clientX, y: event.clientY };
                    pointerMovedRef.current = false;
                  }}
                  onPointerMove={(event) => {
                    if (event.pointerType !== 'touch' || !pointerStartRef.current) {
                      return;
                    }
                    const dx = event.clientX - pointerStartRef.current.x;
                    const dy = event.clientY - pointerStartRef.current.y;
                    if (Math.hypot(dx, dy) > 6) {
                      pointerMovedRef.current = true;
                    }
                  }}
                  onPointerUp={(event) => {
                    if (event.pointerType !== 'touch') {
                      return;
                    }
                    const didMove = pointerMovedRef.current;
                    pointerStartRef.current = null;
                    pointerMovedRef.current = false;
                    if (didMove) {
                      return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    ignoreClickRef.current = true;
                    onCommandSelect(command, { dismissKeyboard: true });
                  }}
                  onPointerCancel={() => {
                    pointerStartRef.current = null;
                    pointerMovedRef.current = false;
                  }}
                  onClick={() => {
                    if (ignoreClickRef.current) {
                      ignoreClickRef.current = false;
                      return;
                    }
                    onCommandSelect(command);
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="mt-0.5">
                    {getCommandIcon(command)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="typography-ui-label font-medium">/{command.name}</span>
                      {visibleTagBadges.map((badge) => (
                        <span
                          key={badge.id}
                          className={cn('text-[10px] leading-none uppercase font-bold tracking-tight px-1.5 py-1 rounded border flex-shrink-0', badge.className)}
                          style={badge.style}
                        >
                          {badge.label}
                        </span>
                      ))}
                      {command.agent && command.agent !== 'general' && (
                        <span className="text-[10px] leading-none font-bold tracking-tight bg-[var(--surface-subtle)] text-[var(--surface-foreground)] border-[var(--interactive-border)] px-1.5 py-1 rounded border flex-shrink-0">
                          {command.agent}
                        </span>
                      )}
                    </div>
                    {command.description && (
                      <div className="typography-meta text-muted-foreground mt-0.5 truncate">
                        {command.description}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {commands.length === 0 && (
              <div className="px-3 py-2 typography-ui-label text-muted-foreground">
                {t('chat.commandAutocomplete.empty')}
              </div>
            )}
          </div>
        )}
      </ScrollableOverlay>
      <div className="px-3 pt-1 pb-1.5 border-t typography-meta text-muted-foreground">
        {t('chat.autocomplete.keyboardHint')}
      </div>
    </div>
  );
});

CommandAutocomplete.displayName = 'CommandAutocomplete';
