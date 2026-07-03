/**
 * Phosphor icon components built directly from SVG paths (Phosphor v2,
 * "regular" weight, viewBox 0 0 256 256). We inline the paths via
 * react-native-svg rather than pulling a whole icon package — only the few
 * glyphs the app actually uses ship in the bundle. `fill={color}` colours the
 * glyph, so these drop into React Navigation's tabBarIcon ({ color, size }).
 *
 * Source: https://github.com/phosphor-icons/core (MIT). Add new glyphs here by
 * copying the regular-weight path `d` from that repo.
 */
import Svg, { Path } from "react-native-svg";

interface IconProps {
  size?: number;
  color?: string;
}

export function House({ size = 24, color = "#000" }: IconProps) {
  return (
    <Svg viewBox="0 0 256 256" width={size} height={size} fill={color}>
      <Path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z" />
    </Svg>
  );
}

export function CalendarMinus({ size = 24, color = "#000" }: IconProps) {
  return (
    <Svg viewBox="0 0 256 256" width={size} height={size} fill={color}>
      <Path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Zm-48-56a8,8,0,0,1-8,8H104a8,8,0,0,1,0-16h48A8,8,0,0,1,160,152Z" />
    </Svg>
  );
}

export function ChatsTeardrop({ size = 24, color = "#000" }: IconProps) {
  return (
    <Svg viewBox="0 0 256 256" width={size} height={size} fill={color}>
      <Path d="M169.57,72.59A80,80,0,0,0,16,104v64a16,16,0,0,0,16,16H86.67A80.15,80.15,0,0,0,160,232h64a16,16,0,0,0,16-16V152A80,80,0,0,0,169.57,72.59ZM32,104a64,64,0,1,1,64,64H32ZM224,216H160a64.14,64.14,0,0,1-55.68-32.43A79.93,79.93,0,0,0,174.7,89.71,64,64,0,0,1,224,152Z" />
    </Svg>
  );
}

export function User({ size = 24, color = "#000" }: IconProps) {
  return (
    <Svg viewBox="0 0 256 256" width={size} height={size} fill={color}>
      <Path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z" />
    </Svg>
  );
}

export function MagnifyingGlass({ size = 24, color = "#000" }: IconProps) {
  return (
    <Svg viewBox="0 0 256 256" width={size} height={size} fill={color}>
      <Path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z" />
    </Svg>
  );
}

export function Clock({ size = 24, color = "#000" }: IconProps) {
  return (
    <Svg viewBox="0 0 256 256" width={size} height={size} fill={color}>
      <Path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z" />
    </Svg>
  );
}

export function MapPin({ size = 24, color = "#000" }: IconProps) {
  return (
    <Svg viewBox="0 0 256 256" width={size} height={size} fill={color}>
      <Path d="M128,64a40,40,0,1,0,40,40A40,40,0,0,0,128,64Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,128,128Zm0-112a88.1,88.1,0,0,0-88,88c0,31.4,14.51,64.68,42,96.25a254.19,254.19,0,0,0,41.45,38.3,8,8,0,0,0,9.18,0A254.19,254.19,0,0,0,174,200.25c27.45-31.57,42-64.85,42-96.25A88.1,88.1,0,0,0,128,16Zm0,206c-16.53-13-72-60.75-72-118a72,72,0,0,1,144,0C200,161.23,144.53,209,128,222Z" />
    </Svg>
  );
}

export function CalendarBlank({ size = 24, color = "#000" }: IconProps) {
  return (
    <Svg viewBox="0 0 256 256" width={size} height={size} fill={color}>
      <Path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z" />
    </Svg>
  );
}

export function CaretLeft({ size = 24, color = "#000" }: IconProps) {
  return (
    <Svg viewBox="0 0 256 256" width={size} height={size} fill={color}>
      <Path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" />
    </Svg>
  );
}

// bookmark-simple. `filled` uses the solid (fill-weight) glyph for the "saved"
// state; otherwise the regular outline. Both tinted with `color`.
export function Bookmark({
  size = 24,
  color = "#000",
  filled = false,
}: IconProps & { filled?: boolean }) {
  return (
    <Svg viewBox="0 0 256 256" width={size} height={size} fill={color}>
      <Path
        d={
          filled
            ? "M184,32H72A16,16,0,0,0,56,48V224a8,8,0,0,0,12.24,6.78L128,193.43l59.77,37.35A8,8,0,0,0,200,224V48A16,16,0,0,0,184,32Z"
            : "M184,32H72A16,16,0,0,0,56,48V224a8,8,0,0,0,12.24,6.78L128,193.43l59.77,37.35A8,8,0,0,0,200,224V48A16,16,0,0,0,184,32Zm0,177.57-51.77-32.35a8,8,0,0,0-8.48,0L72,209.57V48H184Z"
        }
      />
    </Svg>
  );
}
