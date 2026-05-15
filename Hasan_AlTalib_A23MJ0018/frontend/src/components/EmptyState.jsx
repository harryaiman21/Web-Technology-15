import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function EmptyState({ icon: Icon, title, subtitle, action, actions, className }) {
  const resolvedActions = actions || (action ? [action] : []);
  return (
    <div
      className={cn(
        'flex min-h-[180px] flex-col items-center justify-center rounded-[6px] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-6 py-8 text-center',
        className
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-3)] text-[var(--text-3)]">
          <Icon size={22} aria-hidden="true" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-[var(--text-2)]">{title}</h3>
      {subtitle && <p className="mt-2 max-w-md text-sm text-[var(--text-3)]">{subtitle}</p>}
      {resolvedActions.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {resolvedActions.map((item) => (
            <Button
              key={item.label}
              variant={item.variant || 'outline'}
              size="sm"
              onClick={item.onClick}
            >
              {item.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
