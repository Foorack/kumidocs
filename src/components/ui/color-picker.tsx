import Color from "color";
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
  hue: number;
  lightness: number;
  mode: string;
  saturation: number;
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
  const [mode, setMode] = useState("hex");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (value !== undefined) {
      const color = Color.rgb(value).rgb().object();

      setHue(color.r ?? 0);
      setSaturation(color.g ?? 0);
      setLightness(color.b ?? 0);
    }
  }, [value]);

  useEffect((): void => {
    const cb = onChangeRef.current;
    if (cb) {
      const color = Color.hsl(hue, saturation, lightness);
      const rgba = color.rgb().array();

      // oxlint-disable-next-line node/callback-return, promise/prefer-await-to-callbacks
      cb([rgba[0], rgba[1], rgba[2], 1]);
    }
  }, [hue, saturation, lightness]);

  return (
    <ColorPickerContext.Provider
      value={{
        hue,
        lightness,
        mode,
        saturation,
        setHue,
        setLightness,
        setMode,
        setSaturation,
      }}
    >
      <div className={cn("flex size-full flex-col gap-4", className)} {...props} />
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

    return (): void => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }; // eslint-disable-line node/callback-return
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
      {...props}
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
      {...props}
    >
      <Slider.Track className="relative my-0.5 h-3 w-full grow rounded-full bg-[linear-gradient(90deg,#FF0000,#FFFF00,#00FF00,#00FFFF,#0000FF,#FF00FF,#FF0000)]">
        <Slider.Range className="absolute h-full" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </Slider.Root>
  );
}

type ColorPickerOutputProps = ComponentProps<typeof SelectTrigger>;

const FORMATS = ["hex", "rgb", "hsl"];

function ColorPickerOutput({ ...props }: ColorPickerOutputProps): JSX.Element {
  const { mode, setMode } = useColorPicker();

  return (
    <Select onValueChange={setMode} value={mode}>
      <SelectTrigger className="h-8 w-20 shrink-0 text-xs" {...props}>
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

type ColorPickerFormatProps = HTMLAttributes<HTMLDivElement>;

function ColorPickerFormat({
  className,
  ...props
}: ColorPickerFormatProps): JSX.Element | undefined {
  const { hue, saturation, lightness, mode } = useColorPicker();
  const color = Color.hsl(hue, saturation, lightness);

  if (mode === "hex") {
    const hex = color.hex().slice(0, 6).toUpperCase();

    return (
      <div
        className={cn(
          "-space-x-px relative flex w-full items-center rounded-md shadow-sm",
          className,
        )}
        {...props}
      >
        <Input
          className="h-8 w-full bg-secondary px-2 text-xs shadow-none"
          readOnly
          type="text"
          value={hex}
        />
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
        {...props}
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
        {...props}
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
      </div>
    );
  }

  return undefined;
}

export { ColorPicker, ColorPickerFormat, ColorPickerHue, ColorPickerOutput, ColorPickerSelection };
export type {
  ColorPickerFormatProps,
  ColorPickerHueProps,
  ColorPickerOutputProps,
  ColorPickerProps,
  ColorPickerSelectionProps,
};
