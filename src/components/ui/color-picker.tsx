/* oxlint-disable typescript/no-unsafe-type-assertion, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-argument, typescript/no-explicit-any, typescript/strict-boolean-expressions */

import Color from "color";
import { PipetteIcon } from "lucide-react";
import { Slider } from "radix-ui";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ComponentProps, HTMLAttributes } from "react";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import cn from "@/lib/utils";

interface ColorPickerContextValue {
  alpha: number;
  hue: number;
  lightness: number;
  mode: string;
  saturation: number;
  setAlpha: (alpha: number) => void;
  setHue: (hue: number) => void;
  setLightness: (lightness: number) => void;
  setMode: (mode: string) => void;
  setSaturation: (saturation: number) => void;
}

const ColorPickerContext = createContext<ColorPickerContextValue | undefined>(undefined);

function useColorPicker(): ColorPickerContextValue {
  const context = useContext(ColorPickerContext);

  if (!context) {
    throw new Error("useColorPicker must be used within a ColorPickerProvider");
  }

  return context;
}

type ColorPickerProps = HTMLAttributes<HTMLDivElement> & {
  defaultValue?: Parameters<typeof Color>[0];
  onChange?: (value: Parameters<typeof Color.rgb>[0]) => void;
  value?: Parameters<typeof Color>[0];
};

function ColorPicker({
  value,
  defaultValue = "#000000",
  onChange,
  className,
  ...props
}: ColorPickerProps): JSX.Element {
  const selectedColor = Color(value);
  const defaultColor = Color(defaultValue);

  const [hue, setHue] = useState(selectedColor.hue() || defaultColor.hue() || 0);
  const [saturation, setSaturation] = useState(
    selectedColor.saturationl() || defaultColor.saturationl() || 100,
  );
  const [lightness, setLightness] = useState(
    selectedColor.lightness() || defaultColor.lightness() || 50,
  );
  const [alpha, setAlpha] = useState(selectedColor.alpha() * 100 || defaultColor.alpha() * 100);
  const [mode, setMode] = useState("hex");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (value) {
      const color = Color.rgb(value).rgb().object();

      setHue(color.r ?? 0);
      setSaturation(color.g ?? 0);
      setLightness(color.b ?? 0);
      setAlpha(color.a ?? 0);
    }
  }, [value]);

  useEffect(() => {
    const cb = onChangeRef.current;
    if (cb) {
      const color = Color.hsl(hue, saturation, lightness).alpha(alpha / 100);
      const rgba = color.rgb().array();

      cb([rgba[0], rgba[1], rgba[2], alpha / 100]);
    }
  }, [hue, saturation, lightness, alpha]);

  return (
    <ColorPickerContext.Provider
      value={{
        alpha,
        hue,
        lightness,
        mode,
        saturation,
        setAlpha,
        setHue,
        setLightness,
        setMode,
        setSaturation,
      }}
    >
      <div className={cn("flex size-full flex-col gap-4", className)} {...(props as any)} />
    </ColorPickerContext.Provider>
  );
}

type ColorPickerSelectionProps = HTMLAttributes<HTMLDivElement>;

const ColorPickerSelection: React.MemoExoticComponent<
  (props: ColorPickerSelectionProps) => JSX.Element
> = memo(({ className, ...props }: ColorPickerSelectionProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [positionX, setPositionX] = useState(0);
  const [positionY, setPositionY] = useState(0);
  const { hue, setSaturation, setLightness } = useColorPicker();

  const backgroundGradient = useMemo(
    () =>
      `linear-gradient(0deg, rgba(0,0,0,1), rgba(0,0,0,0)),
            linear-gradient(90deg, rgba(255,255,255,1), rgba(255,255,255,0)),
            hsl(${hue}, 100%, 50%)`,
    [hue],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!(isDragging && containerRef.current)) {
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const cursorX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const cursorY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      setPositionX(cursorX);
      setPositionY(cursorY);
      setSaturation(cursorX * 100);
      const topLightness = cursorX < 0.01 ? 100 : 50 + 50 * (1 - cursorX);
      const lightness = topLightness * (1 - cursorY);

      setLightness(lightness);
    },
    [isDragging, setSaturation, setLightness],
  );

  useEffect((): (() => void) => {
    const handlePointerUp = (): void => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    }

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDragging, handlePointerMove]);

  return (
    <div
      className={cn("relative size-full cursor-crosshair rounded", className)}
      onPointerDown={(pointerEvent) => {
        pointerEvent.preventDefault();
        setIsDragging(true);
        handlePointerMove(pointerEvent.nativeEvent);
      }}
      ref={containerRef}
      style={{
        background: backgroundGradient,
      }}
      {...(props as any)}
    >
      <div
        className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute h-4 w-4 rounded-full border-2 border-white"
        style={{
          boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
          left: `${positionX * 100}%`,
          top: `${positionY * 100}%`,
        }}
      />
    </div>
  );
});

ColorPickerSelection.displayName = "ColorPickerSelection";

type ColorPickerHueProps = ComponentProps<typeof Slider.Root>;

function ColorPickerHue({ className, ...props }: ColorPickerHueProps): JSX.Element {
  const { hue, setHue } = useColorPicker();

  return (
    <Slider.Root
      className={cn("relative flex h-4 w-full touch-none", className)}
      max={360}
      onValueChange={([hueValue = 0]) => {
        setHue(hueValue);
      }}
      step={1}
      value={[hue]}
      {...(props as any)}
    >
      <Slider.Track className="relative my-0.5 h-3 w-full grow rounded-full bg-[linear-gradient(90deg,#FF0000,#FFFF00,#00FF00,#00FFFF,#0000FF,#FF00FF,#FF0000)]">
        <Slider.Range className="absolute h-full" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </Slider.Root>
  );
}

type ColorPickerAlphaProps = ComponentProps<typeof Slider.Root>;

function ColorPickerAlpha({ className, ...props }: ColorPickerAlphaProps): JSX.Element {
  const { alpha, setAlpha } = useColorPicker();

  return (
    <Slider.Root
      className={cn("relative flex h-4 w-full touch-none", className)}
      max={100}
      onValueChange={([alphaValue = 0]) => {
        setAlpha(alphaValue);
      }}
      step={1}
      value={[alpha]}
      {...(props as any)}
    >
      <Slider.Track
        className="relative my-0.5 h-3 w-full grow rounded-full"
        style={{
          background:
            'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==") left center',
        }}
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent to-black/50" />
        <Slider.Range className="absolute h-full rounded-full bg-transparent" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </Slider.Root>
  );
}

type ColorPickerEyeDropperProps = ComponentProps<typeof Button>;

function ColorPickerEyeDropper({ className, ...props }: ColorPickerEyeDropperProps): JSX.Element {
  const { setHue, setSaturation, setLightness, setAlpha } = useColorPicker();

  const handleEyeDropper = async (): Promise<void> => {
    try {
      // @ts-expect-error - EyeDropper API is experimental
      const eyeDropper = new EyeDropper();
      const result = await eyeDropper.open();
      const color = Color(result.sRGBHex);
      const [hueValue = 0, satValue = 0, lightValue = 0] = color.hsl().array();

      setHue(hueValue);
      setSaturation(satValue);
      setLightness(lightValue);
      setAlpha(100);
    } catch (error) {
      console.error("EyeDropper failed:", error);
    }
  };

  return (
    <Button
      className={cn("shrink-0 text-muted-foreground", className)}
      onClick={handleEyeDropper}
      size="icon"
      type="button"
      variant="outline"
      {...(props as any)}
    >
      <PipetteIcon size={16} />
    </Button>
  );
}

type ColorPickerOutputProps = ComponentProps<typeof SelectTrigger>;

const FORMATS = ["hex", "rgb", "css", "hsl"];

function ColorPickerOutput({ ...props }: ColorPickerOutputProps): JSX.Element {
  const { mode, setMode } = useColorPicker();

  return (
    <Select onValueChange={setMode} value={mode}>
      <SelectTrigger className="h-8 w-20 shrink-0 text-xs" {...(props as any)}>
        <SelectValue placeholder="Mode" />
      </SelectTrigger>
      <SelectContent>
        {FORMATS.map((format) => (
          <SelectItem className="text-xs" key={format} value={format}>
            {format.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type PercentageInputProps = ComponentProps<typeof Input>;

function PercentageInput({ className, ...props }: PercentageInputProps): JSX.Element {
  return (
    <div className="relative">
      <Input
        readOnly
        type="text"
        {...(props as any)}
        className={cn(
          "h-8 w-[3.25rem] rounded-l-none bg-secondary px-2 text-xs shadow-none",
          className,
        )}
      />
      <span className="-translate-y-1/2 absolute top-1/2 right-2 text-muted-foreground text-xs">
        %
      </span>
    </div>
  );
}

type ColorPickerFormatProps = HTMLAttributes<HTMLDivElement>;

function ColorPickerFormat({
  className,
  ...props
}: ColorPickerFormatProps): JSX.Element | undefined {
  const { hue, saturation, lightness, alpha, mode } = useColorPicker();
  const color = Color.hsl(hue, saturation, lightness, alpha / 100);

  if (mode === "hex") {
    const hex = color.hex();

    return (
      <div
        className={cn(
          "-space-x-px relative flex w-full items-center rounded-md shadow-sm",
          className,
        )}
        {...(props as any)}
      >
        <Input
          className="h-8 rounded-r-none bg-secondary px-2 text-xs shadow-none"
          readOnly
          type="text"
          value={hex}
        />
        <PercentageInput value={alpha} />
      </div>
    );
  }

  if (mode === "rgb") {
    const rgb = color
      .rgb()
      .array()
      .map((value) => Math.round(value));

    return (
      <div
        className={cn("-space-x-px flex items-center rounded-md shadow-sm", className)}
        {...(props as any)}
      >
        {rgb.map((value, rgbIndex) => (
          <Input
            className={cn(
              "h-8 rounded-r-none bg-secondary px-2 text-xs shadow-none",
              rgbIndex && "rounded-l-none",
              className,
            )}
            key={rgbIndex}
            readOnly
            type="text"
            value={value}
          />
        ))}
        <PercentageInput value={alpha} />
      </div>
    );
  }

  if (mode === "css") {
    const rgb = color
      .rgb()
      .array()
      .map((value) => Math.round(value));

    return (
      <div className={cn("w-full rounded-md shadow-sm", className)} {...(props as any)}>
        <Input
          className="h-8 w-full bg-secondary px-2 text-xs shadow-none"
          readOnly
          type="text"
          value={`rgba(${rgb.join(", ")}, ${alpha}%)`}
        />
      </div>
    );
  }

  if (mode === "hsl") {
    const hsl = color
      .hsl()
      .array()
      .map((value) => Math.round(value));

    return (
      <div
        className={cn("-space-x-px flex items-center rounded-md shadow-sm", className)}
        {...(props as any)}
      >
        {hsl.map((value, hslIndex) => (
          <Input
            className={cn(
              "h-8 rounded-r-none bg-secondary px-2 text-xs shadow-none",
              hslIndex && "rounded-l-none",
              className,
            )}
            key={hslIndex}
            readOnly
            type="text"
            value={value}
          />
        ))}
        <PercentageInput value={alpha} />
      </div>
    );
  }

  return undefined;
}

export {
  ColorPicker,
  ColorPickerAlpha,
  ColorPickerEyeDropper,
  ColorPickerFormat,
  ColorPickerHue,
  ColorPickerOutput,
  ColorPickerSelection,
};
export type {
  ColorPickerAlphaProps,
  ColorPickerEyeDropperProps,
  ColorPickerFormatProps,
  ColorPickerHueProps,
  ColorPickerOutputProps,
  ColorPickerProps,
  ColorPickerSelectionProps,
};
