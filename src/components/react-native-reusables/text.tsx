import { cn } from "@/lib/utils";
import { Slot } from "@rn-primitives/slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { Platform, Text as RNText, type Role, type TextStyle } from "react-native";
import { TINT_TEXT, type TintToken } from "@/src/lib/design-tokens";

// Match Wikipedia's content typography — the system sans-serif stack — rather than a
// bundled webfont. This also mirrors the article iframe's body font (see
// READABLE_STYLESHEET) so the app chrome and the article read as one typeface.
//
// On web we MUST name a family explicitly: react-native-web leaves Text without a
// family, and the browser's default for unstyled text is serif (Times). On native we
// return undefined so the platform's own sans-serif default is used. Weight is carried
// by the `font-*` className in every case, so a single family is enough here.
const APP_FONT_FAMILY = Platform.select({
  web: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  default: undefined,
});

const textVariants = cva(
  cn(
    "text-foreground text-base",
    Platform.select({
      web: "select-text",
    }),
  ),
  {
    variants: {
      variant: {
        default: "",
        h1: cn(
          "text-4xl font-extrabold tracking-tight",
          Platform.select({ web: "scroll-m-20 text-balance" }),
        ),
        h2: cn(
          "text-3xl font-semibold tracking-tight",
          Platform.select({ web: "scroll-m-20 first:mt-0" }),
        ),
        h3: cn("text-2xl font-semibold tracking-tight", Platform.select({ web: "scroll-m-20" })),
        h4: cn("text-xl font-semibold tracking-tight", Platform.select({ web: "scroll-m-20" })),
        p: "mt-3 leading-7 sm:mt-6",
        blockquote: "mt-4 border-l-2 pl-3 italic sm:mt-6 sm:pl-6",
        code: cn(
          "bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold",
        ),
        lead: "text-muted-foreground text-xl",
        large: "text-lg font-semibold",
        small: "text-sm font-medium leading-none",
        muted: "text-muted-foreground text-sm",
        eyebrow: "text-[11px] font-bold uppercase tracking-[0.14em]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type TextVariantProps = VariantProps<typeof textVariants>;

type TextVariant = NonNullable<TextVariantProps["variant"]>;

const ROLE: Partial<Record<TextVariant, Role>> = {
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  blockquote: Platform.select({ web: "blockquote" as Role }),
  code: Platform.select({ web: "code" as Role }),
};

const ARIA_LEVEL: Partial<Record<TextVariant, string>> = {
  h1: "1",
  h2: "2",
  h3: "3",
  h4: "4",
};

const TextClassContext = React.createContext<string | undefined>(undefined);

function resolveFontFamily(classes: string): string | undefined {
  // Monospace (e.g. the `code` variant) keeps the className-provided mono stack.
  if (classes.includes("font-mono")) {
    return undefined;
  }

  return APP_FONT_FAMILY;
}

export function getTextFontStyle(classNames: (string | undefined)[]): TextStyle | undefined {
  const classes = classNames.filter(Boolean).join(" ");
  const fontFamily = resolveFontFamily(classes);

  if (!fontFamily) {
    return undefined;
  }

  return { fontFamily };
}

function Text({
  className,
  asChild = false,
  variant = "default",
  tint,
  style,
  ...props
}: React.ComponentProps<typeof RNText> &
  React.RefAttributes<typeof RNText> &
  TextVariantProps & {
    asChild?: boolean;
    tint?: TintToken;
  }) {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot : RNText;
  const resolvedVariant = variant ?? "default";
  const variantClassName = textVariants({ variant: resolvedVariant });
  // For eyebrow: default to muted-foreground if no tint; honor tint if set.
  // For other variants: apply tint only if explicitly set (no default color override).
  const tintColor =
    resolvedVariant === "eyebrow"
      ? tint
        ? TINT_TEXT[tint]
        : "text-muted-foreground"
      : tint
        ? TINT_TEXT[tint]
        : undefined;
  return (
    <Component
      className={cn(variantClassName, tintColor, textClass, className)}
      role={ROLE[resolvedVariant]}
      aria-level={ARIA_LEVEL[resolvedVariant]}
      style={[getTextFontStyle([variantClassName, textClass, className]), style]}
      {...props}
    />
  );
}

export { Text, TextClassContext };
