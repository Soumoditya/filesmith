import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card, Checkbox, Field, TextInput, Textarea } from "../../components/ui";
import {
  newId,
  type EducationItem,
  type ExperienceItem,
  type ProjectItem,
  type Section,
} from "../../lib/resume/model";

/**
 * Form pieces for one resume section. Each editor owns the shape of its own
 * data and reports a whole replacement section upwards, which keeps the
 * parent free of a large reducer.
 */

export function SectionFrame({
  section,
  index,
  total,
  onChange,
  onMove,
  onRemove,
  children,
}: {
  section: Section;
  index: number;
  total: number;
  onChange: (next: Section) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line bg-sunken px-3 py-2">
        <GripVertical className="size-4 shrink-0 text-faint" aria-hidden />

        <input
          value={section.title}
          onChange={(e) => onChange({ ...section, title: e.target.value })}
          aria-label="Section heading"
          className="h-9 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 text-sm font-semibold text-ink hover:border-line focus:border-accent focus:bg-surface focus:outline-none touch:h-11"
        />

        <Button
          variant="ghost"
          size="sm"
          className="px-1.5"
          onClick={() => onChange({ ...section, hidden: !section.hidden })}
          aria-label={section.hidden ? "Show this section" : "Hide this section"}
          title={section.hidden ? "Hidden — click to show" : "Visible — click to hide"}
        >
          {section.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="px-1.5"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          aria-label="Move section up"
        >
          <ArrowUp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="px-1.5"
          disabled={index === total - 1}
          onClick={() => onMove(1)}
          aria-label="Move section down"
        >
          <ArrowDown className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="px-1.5"
          onClick={onRemove}
          aria-label="Delete this section"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className={section.hidden ? "p-4 opacity-50" : "p-4"}>
        {section.hidden && (
          <p className="mb-3 text-xs text-muted">
            Hidden — this section won’t appear in the finished resume.
          </p>
        )}
        {children}
      </div>
    </Card>
  );
}

/** A repeated entry (a job, a degree) with its own controls. */
function ItemFrame({
  label,
  index,
  total,
  onMove,
  onRemove,
  children,
}: {
  label: string;
  index: number;
  total: number;
  onMove: (delta: number) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted">{label}</p>
        <div className="flex shrink-0 gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="px-1.5"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label={`Move ${label} up`}
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="px-1.5"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label={`Move ${label} down`}
          >
            <ArrowDown className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="px-1.5"
            onClick={onRemove}
            aria-label={`Remove ${label}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Bullets edited as one textarea, one per line — far faster than a list of inputs. */
function BulletEditor({
  value,
  onChange,
  hint,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  hint?: string;
}) {
  return (
    <Field
      label="What you did"
      hint={hint ?? "One point per line. Lead with the result, and use numbers where you can."}
    >
      {(id) => (
        <Textarea
          id={id}
          rows={Math.max(3, value.length + 1)}
          value={value.join("\n")}
          onChange={(e) => onChange(e.target.value.split("\n"))}
          placeholder={"Cut fulfilment cost per order by 18%\nTrained 12 warehouse leads on the new system"}
        />
      )}
    </Field>
  );
}

function DateFields({
  item,
  onChange,
  allowCurrent = true,
}: {
  item: { start: string; end: string; current?: boolean };
  onChange: (patch: Partial<{ start: string; end: string; current: boolean }>) => void;
  allowCurrent?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From" hint="2022-03, or just 2022">
          {(id) => (
            <TextInput
              id={id}
              value={item.start}
              onChange={(e) => onChange({ start: e.target.value })}
              placeholder="2022-03"
            />
          )}
        </Field>
        <Field label="To">
          {(id) => (
            <TextInput
              id={id}
              value={item.end}
              disabled={item.current}
              onChange={(e) => onChange({ end: e.target.value })}
              placeholder={item.current ? "Present" : "2024-06"}
            />
          )}
        </Field>
      </div>
      {allowCurrent && (
        <Checkbox
          label="I’m still here"
          checked={item.current ?? false}
          onChange={(e) => onChange({ current: e.target.checked })}
        />
      )}
    </div>
  );
}

export function ExperienceEditor({
  items,
  onChange,
}: {
  items: ExperienceItem[];
  onChange: (next: ExperienceItem[]) => void;
}) {
  const patch = (index: number, changes: Partial<ExperienceItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...changes } : item)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <ItemFrame
          key={item.id}
          label={item.role || item.organisation || `Role ${i + 1}`}
          index={i}
          total={items.length}
          onMove={(d) => move(i, d)}
          onRemove={() => onChange(items.filter((_, j) => j !== i))}
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Job title">
                {(id) => (
                  <TextInput
                    id={id}
                    value={item.role}
                    onChange={(e) => patch(i, { role: e.target.value })}
                    placeholder="Operations Analyst"
                  />
                )}
              </Field>
              <Field label="Company">
                {(id) => (
                  <TextInput
                    id={id}
                    value={item.organisation}
                    onChange={(e) => patch(i, { organisation: e.target.value })}
                    placeholder="Meridian Logistics"
                  />
                )}
              </Field>
            </div>

            <Field label="Location">
              {(id) => (
                <TextInput
                  id={id}
                  value={item.location}
                  onChange={(e) => patch(i, { location: e.target.value })}
                  placeholder="Bengaluru"
                />
              )}
            </Field>

            <DateFields item={item} onChange={(p) => patch(i, p)} />
            <BulletEditor
              value={item.bullets}
              onChange={(bullets) => patch(i, { bullets })}
            />
          </div>
        </ItemFrame>
      ))}

      <Button
        size="sm"
        onClick={() =>
          onChange([
            ...items,
            {
              id: newId("e"),
              role: "",
              organisation: "",
              location: "",
              start: "",
              end: "",
              bullets: [""],
            },
          ])
        }
      >
        <Plus className="size-4" aria-hidden />
        Add a job
      </Button>
    </div>
  );
}

export function EducationEditor({
  items,
  onChange,
}: {
  items: EducationItem[];
  onChange: (next: EducationItem[]) => void;
}) {
  const patch = (index: number, changes: Partial<EducationItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...changes } : item)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <ItemFrame
          key={item.id}
          label={item.qualification || item.institution || `Qualification ${i + 1}`}
          index={i}
          total={items.length}
          onMove={(d) => move(i, d)}
          onRemove={() => onChange(items.filter((_, j) => j !== i))}
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Qualification">
                {(id) => (
                  <TextInput
                    id={id}
                    value={item.qualification}
                    onChange={(e) => patch(i, { qualification: e.target.value })}
                    placeholder="B.Com, Statistics"
                  />
                )}
              </Field>
              <Field label="Institution">
                {(id) => (
                  <TextInput
                    id={id}
                    value={item.institution}
                    onChange={(e) => patch(i, { institution: e.target.value })}
                    placeholder="University of Pune"
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Location">
                {(id) => (
                  <TextInput
                    id={id}
                    value={item.location}
                    onChange={(e) => patch(i, { location: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Result" hint="Percentage, CGPA or classification.">
                {(id) => (
                  <TextInput
                    id={id}
                    value={item.grade}
                    onChange={(e) => patch(i, { grade: e.target.value })}
                    placeholder="First class, 8.4 CGPA"
                  />
                )}
              </Field>
            </div>

            <DateFields item={item} onChange={(p) => patch(i, p)} allowCurrent={false} />

            <Field label="Anything else" hint="Optional — a thesis title, a relevant module.">
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  value={item.notes}
                  onChange={(e) => patch(i, { notes: e.target.value })}
                />
              )}
            </Field>
          </div>
        </ItemFrame>
      ))}

      <Button
        size="sm"
        onClick={() =>
          onChange([
            ...items,
            {
              id: newId("d"),
              qualification: "",
              institution: "",
              location: "",
              start: "",
              end: "",
              grade: "",
              notes: "",
            },
          ])
        }
      >
        <Plus className="size-4" aria-hidden />
        Add a qualification
      </Button>
    </div>
  );
}

export function ProjectsEditor({
  items,
  onChange,
}: {
  items: ProjectItem[];
  onChange: (next: ProjectItem[]) => void;
}) {
  const patch = (index: number, changes: Partial<ProjectItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...changes } : item)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <ItemFrame
          key={item.id}
          label={item.name || `Project ${i + 1}`}
          index={i}
          total={items.length}
          onMove={(d) => move(i, d)}
          onRemove={() => onChange(items.filter((_, j) => j !== i))}
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Project name">
                {(id) => (
                  <TextInput
                    id={id}
                    value={item.name}
                    onChange={(e) => patch(i, { name: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Your role">
                {(id) => (
                  <TextInput
                    id={id}
                    value={item.role}
                    onChange={(e) => patch(i, { role: e.target.value })}
                  />
                )}
              </Field>
            </div>

            <Field label="Link" hint="Optional.">
              {(id) => (
                <TextInput
                  id={id}
                  value={item.link}
                  onChange={(e) => patch(i, { link: e.target.value })}
                  placeholder="github.com/you/project"
                />
              )}
            </Field>

            <DateFields item={item} onChange={(p) => patch(i, p)} />
            <BulletEditor
              value={item.bullets}
              onChange={(bullets) => patch(i, { bullets })}
              hint="One point per line. What did it do, and what came of it?"
            />
          </div>
        </ItemFrame>
      ))}

      <Button
        size="sm"
        onClick={() =>
          onChange([
            ...items,
            {
              id: newId("p"),
              name: "",
              role: "",
              link: "",
              start: "",
              end: "",
              bullets: [""],
            },
          ])
        }
      >
        <Plus className="size-4" aria-hidden />
        Add a project
      </Button>
    </div>
  );
}

export function SkillsEditor({
  groups,
  onChange,
}: {
  groups: Array<{ id: string; label: string; items: string[] }>;
  onChange: (next: Array<{ id: string; label: string; items: string[] }>) => void;
}) {
  return (
    <div className="space-y-3">
      {groups.map((group, i) => (
        <div key={group.id} className="flex items-end gap-2">
          <Field label="Group" className="w-32 shrink-0">
            {(id) => (
              <TextInput
                id={id}
                value={group.label}
                onChange={(e) =>
                  onChange(
                    groups.map((g, j) => (j === i ? { ...g, label: e.target.value } : g)),
                  )
                }
                placeholder="Analysis"
              />
            )}
          </Field>
          <Field label="Skills" className="min-w-0 flex-1" hint="Separate with commas.">
            {(id) => (
              <TextInput
                id={id}
                value={group.items.join(", ")}
                onChange={(e) =>
                  onChange(
                    groups.map((g, j) =>
                      j === i
                        ? {
                            ...g,
                            items: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          }
                        : g,
                    ),
                  )
                }
                placeholder="Excel, SQL, Power BI"
              />
            )}
          </Field>
          <Button
            variant="ghost"
            size="sm"
            className="mb-6 px-1.5"
            onClick={() => onChange(groups.filter((_, j) => j !== i))}
            aria-label={`Remove ${group.label || "group"}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      <Button
        size="sm"
        onClick={() => onChange([...groups, { id: newId("g"), label: "", items: [] }])}
      >
        <Plus className="size-4" aria-hidden />
        Add a group
      </Button>
    </div>
  );
}

export function ListEditor({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  return (
    <Field label="Items" hint="One per line.">
      {(id) => (
        <Textarea
          id={id}
          rows={Math.max(3, items.length + 1)}
          value={items.join("\n")}
          onChange={(e) => onChange(e.target.value.split("\n"))}
          placeholder={placeholder ?? "Lean Six Sigma Green Belt — 2023"}
        />
      )}
    </Field>
  );
}
