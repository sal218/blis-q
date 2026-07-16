import { useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Map,
  Camera,
  GeoJSONSource,
  Layer,
} from "@maplibre/maplibre-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { CaretLeft } from "@/components/icons/PhosphorIcons";
import { useSafePlaceMarkers } from "@/hooks/useSafePlaceMarkers";
import { buildBasemapStyle, getBasemapUrl } from "@/lib/basemapStyle";
import { markersToFeatureCollection, pressedMarkerId } from "@/lib/mapMarkers";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";
import type { EventsStackParamList } from "@/navigation/AppTabs";

// Safe Places map (P-40 SP-4b, slice 1 — de-risk). A dedicated full-screen map
// reached from the Safe Places tab: the self-hosted Poland PMTiles basemap +
// every curated venue as a native pin; tapping a pin opens its detail. NO
// clustering / fullscreen chrome / list↔map sync / dark style / near-me — those
// are slice 2 / SP-4c. Venue coordinates are admin data (allowed); NO user
// location this slice. The basemap is public OSM map data (documented §3
// exception). Rendering is validated ON-DEVICE (native module, mocked in tests).

type Props = NativeStackScreenProps<EventsStackParamList, "SafePlacesMap">;

const POLAND_CENTER: [number, number] = [19.0, 52.0]; // [longitude, latitude]
const POLAND_ZOOM = 5.3;
const PIN_COLOR = "#7C5CFF"; // brand purple
const SCRIM = "rgba(0,0,0,0.5)";

export function SafePlacesMapScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { markers, status, retry } = useSafePlaceMarkers();

  const basemapUrl = getBasemapUrl();
  const mapStyle = useMemo(
    () => (basemapUrl ? buildBasemapStyle(basemapUrl) : null),
    [basemapUrl],
  );
  const featureCollection = useMemo(
    () => markersToFeatureCollection(markers),
    [markers],
  );

  const backButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={strings.safePlaces.map.back}
      hitSlop={8}
      onPress={() => navigation.goBack()}
      style={[styles.backBtn, { top: insets.top + spacing.sm }]}
    >
      <CaretLeft size={22} color="#fff" />
    </Pressable>
  );

  // Basemap host not configured (dev before provisioning) → a friendly notice
  // rather than a broken native map.
  if (!mapStyle) {
    return (
      <View style={[styles.root, styles.centered]}>
        {backButton}
        <Text style={styles.msg}>{strings.safePlaces.map.unavailable}</Text>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={[styles.root, styles.centered]}>
        {backButton}
        <Text style={styles.msg}>{strings.safePlaces.map.loadError}</Text>
        <View style={styles.retryWrap}>
          <PrimaryButton label={strings.safePlaces.retry} onPress={retry} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Map style={styles.map} mapStyle={mapStyle} testID="safe-places-map">
        <Camera
          initialViewState={{ center: POLAND_CENTER, zoom: POLAND_ZOOM }}
        />
        <GeoJSONSource
          id="markers"
          data={featureCollection}
          onPress={(e) => {
            const id = pressedMarkerId(e);
            if (id) navigation.navigate("SafePlaceDetail", { id });
          }}
        >
          <Layer
            id="marker-pins"
            type="circle"
            source="markers"
            paint={{
              "circle-radius": 7,
              "circle-color": PIN_COLOR,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            }}
          />
        </GeoJSONSource>
      </Map>

      {backButton}

      {/* ODbL attribution — mandatory wherever OSM-derived data renders. */}
      <View
        style={[styles.attribution, { bottom: insets.bottom + spacing.sm }]}
      >
        <Text style={styles.attributionText}>
          {strings.safePlaces.map.attribution}
        </Text>
      </View>

      {status === "loading" ? (
        <View style={styles.loadingBadge} pointerEvents="none">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : status === "ready" && markers.length === 0 ? (
        <View style={styles.emptyBadge} pointerEvents="none">
          <Text style={styles.emptyText}>{strings.safePlaces.map.empty}</Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    map: { flex: 1 },
    centered: {
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
    },
    backBtn: {
      position: "absolute",
      left: spacing.lg,
      zIndex: 10,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: SCRIM,
    },
    msg: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
      marginBottom: spacing.md,
    },
    retryWrap: { alignSelf: "stretch" },
    attribution: {
      position: "absolute",
      right: spacing.sm,
      backgroundColor: "rgba(255,255,255,0.8)",
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    attributionText: { color: "#333", fontSize: 10 },
    loadingBadge: {
      position: "absolute",
      top: spacing.xl * 2,
      alignSelf: "center",
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: spacing.sm,
    },
    emptyBadge: {
      position: "absolute",
      top: spacing.xl * 2,
      alignSelf: "center",
      backgroundColor: colors.card,
      borderRadius: 12,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyText: { color: colors.textMuted, fontSize: 13 },
  });
}
