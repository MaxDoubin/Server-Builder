import { Sun, Moon, Type, Contrast } from "lucide-react";
import { FONT_SCALES, useTheme } from "@/lib/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Theme, text size and high contrast, in the slot the theme picker used.
 *
 * The provider has carried all three preferences for a while: it stores them,
 * puts `high-contrast` on the root element, and sets --font-scale. Only the
 * theme had anything to click. The other two were implemented, persisted, and
 * unreachable, which is the same as not having them.
 *
 * The steps are deliberately coarse. --font-scale moves the rem basis, so it
 * scales the whole layout rather than only the words, and three settings a
 * reader can tell apart at a glance beat a slider whose middle values all
 * look the same.
 */

/*
  The values come from the provider, which snaps a stored scale to one of
  them, so the menu cannot offer a size the provider would refuse. The names
  are copy and live here. A size added to FONT_SCALES appears immediately,
  labelled by percentage until somebody names it.
*/
const SCALE_NAMES: Record<string, string> = {
  "1": "Normal",
  "1.15": "Large",
  "1.3": "Larger",
};

const TEXT_SIZES = FONT_SCALES.map((scale) => {
  const value = String(scale);
  return { value, label: SCALE_NAMES[value] ?? `${Math.round(scale * 100)}%` };
});

export function DisplayMenu({ testId = "button-display-menu" }: { testId?: string }) {
  const { theme, setTheme, fontScale, setFontScale, highContrast, toggleHighContrast } =
    useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          data-testid={testId}
          // Icon only. It used to say "Toggle theme", which was accurate when
          // that was all it did and is now a lie about two thirds of it.
          aria-label="Display options"
        >
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as "light" | "dark")}
        >
          <DropdownMenuRadioItem value="light" data-testid="menu-theme-light">
            <Sun className="mr-2 h-4 w-4" /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" data-testid="menu-theme-dark">
            <Moon className="mr-2 h-4 w-4" /> Dark
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Text size</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          // The stored value is a number and the menu compares strings, so a
          // scale of 1 has to arrive here as "1" or nothing looks selected.
          value={String(fontScale)}
          onValueChange={(value) => setFontScale(Number(value))}
        >
          {TEXT_SIZES.map((size) => (
            <DropdownMenuRadioItem
              key={size.value}
              value={size.value}
              data-testid={`menu-text-${size.label.toLowerCase()}`}
            >
              <Type className="mr-2 h-4 w-4" /> {size.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuCheckboxItem
          checked={highContrast}
          onCheckedChange={() => toggleHighContrast()}
          data-testid="menu-high-contrast"
        >
          <Contrast className="mr-2 h-4 w-4" /> High contrast
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
