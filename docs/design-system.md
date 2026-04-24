# Design System

All color tokens defined in `src/styles/globals.css` inside `@theme {}`. Available as Tailwind utilities.

## Color Tokens

| Token                         | Value   |
| ----------------------------- | ------- |
| `bg-background`               | #faf9f7 |
| `bg-surface-container-lowest` | #ffffff |
| `bg-surface-container-low`    | #f4f4f1 |
| `bg-surface-container`        | #edeeec |
| `text-on-surface`             | #303331 |
| `text-on-surface-variant`     | #5d605e |
| `bg-primary`                  | #526448 |
| `text-on-primary`             | #ecffdd |
| `bg-primary-container`        | #d4e9c5 |
| `bg-secondary-container`      | #eae1d4 |
| `text-on-secondary-container` | #565147 |
| `text-outline-variant`        | #b0b2b0 |

## Component Patterns

**Card:** `bg-surface-container-lowest rounded-[2rem] border border-transparent hover:border-outline-variant/10 hover:shadow-[0_4px_40px_rgba(48,51,49,0.06)] transition-all duration-500`

**Chip:** `bg-secondary-container text-on-secondary-container px-3 py-1.5 rounded-xl text-xs font-medium`

**Primary button:** `bg-primary hover:bg-primary-dim text-on-primary font-bold py-4 px-6 rounded-full shadow-sm`

**Primary FAB:** `bg-gradient-to-r from-primary to-primary-dim text-on-primary rounded-full shadow-[0_10px_40px_rgba(82,100,72,0.2)]`

**Writing area:** `bg-transparent border-none text-xl leading-[1.8] font-light text-on-surface placeholder:text-outline-variant/40`

**Active nav (desktop):** `bg-surface-container-lowest text-primary font-bold shadow-sm scale-[0.98] rounded-xl`

**Bottom nav bar:** `bg-surface/70 backdrop-blur-xl rounded-t-3xl shadow-[0_-4px_40px_rgba(48,51,49,0.06)] fixed bottom-0 left-0 w-full px-6 pb-8 pt-4`
