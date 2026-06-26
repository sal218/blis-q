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
