import { View, Text, Image } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";

// Avatar that renders the image when present, otherwise a coloured square with
// the first letter of the name. Shared by community cards/detail and the
// blocked-users list so the image-fallback logic lives in one place. Size and
// corner radius are passed in (cards use a small rounded square, the detail
// header a larger one, the blocked list a circle).

interface AvatarProps {
  uri: string | null;
  name: string;
  size: number;
  borderRadius: number;
}

export function Avatar({ uri, name, size, borderRadius }: AvatarProps) {
  const { colors } = useTheme();
  const box = { width: size, height: size, borderRadius };

  if (uri) {
    return <Image source={{ uri }} style={box} />;
  }

  return (
    <View
      style={[
        box,
        {
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.primary,
        },
      ]}
    >
      <Text
        style={{
          color: "#FFFFFF",
          fontSize: Math.round(size * 0.42),
          fontWeight: "700",
        }}
      >
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}
