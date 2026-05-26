import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, Text, View } from "react-native";

type SessionCompletionModalProps = {
  visible: boolean;
  panelColor: string;
  panelTextColor: string;
  mutedTextColor: string;
  primaryActionColor: string;
  primaryActionTextColor: string;
  secondaryActionColor: string;
  onContinue: () => void;
  onGoHome: () => void;
  pagesRead: number;
  durationMinutes: number;
};

const ENCOURAGEMENTS = [
  "Every page adds up.",
  "Steady reading builds momentum.",
  "A short session still counts.",
  "You are making progress.",
];

export function SessionCompletionModal({
  visible,
  panelColor,
  panelTextColor,
  mutedTextColor,
  primaryActionColor,
  primaryActionTextColor,
  secondaryActionColor,
  onContinue,
  onGoHome,
  pagesRead,
  durationMinutes,
}: SessionCompletionModalProps) {
  const encouragement =
    ENCOURAGEMENTS[(pagesRead + durationMinutes) % ENCOURAGEMENTS.length];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onContinue}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 400,
            borderRadius: 28,
            padding: 28,
            gap: 20,
            backgroundColor: panelColor,
          }}
        >
          <View style={{ alignItems: "center" }}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: "rgba(127, 127, 127, 0.12)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="checkmark-circle" size={48} color="#5B9A71" />
            </View>
          </View>

          <View style={{ alignItems: "center", gap: 8 }}>
            <Text
              style={{
                color: panelTextColor,
                fontSize: 28,
                fontWeight: "800",
                textAlign: "center",
              }}
            >
              Session Complete
            </Text>
            <Text
              style={{
                color: mutedTextColor,
                fontSize: 16,
                lineHeight: 24,
                textAlign: "center",
              }}
            >
              {encouragement}
            </Text>
          </View>

          <View
            style={{
              borderRadius: 20,
              padding: 18,
              gap: 14,
              backgroundColor: secondaryActionColor,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: "rgba(127, 127, 127, 0.12)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="book" size={18} color={panelTextColor} />
                </View>
                <Text style={{ color: mutedTextColor, fontSize: 16 }}>Pages read</Text>
              </View>
              <Text style={{ color: panelTextColor, fontSize: 18, fontWeight: "800" }}>{pagesRead}</Text>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: "rgba(127, 127, 127, 0.12)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="time" size={18} color={panelTextColor} />
                </View>
                <Text style={{ color: mutedTextColor, fontSize: 16 }}>Time spent</Text>
              </View>
              <Text style={{ color: panelTextColor, fontSize: 18, fontWeight: "800" }}>
                {durationMinutes} min
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
            <Pressable
              onPress={onGoHome}
              style={({ pressed }) => ({
                flex: 1,
                borderRadius: 18,
                paddingVertical: 14,
                paddingHorizontal: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: secondaryActionColor,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text style={{ color: panelTextColor, fontSize: 15, fontWeight: "700" }}>Go to Home</Text>
            </Pressable>

            <Pressable
              onPress={onContinue}
              style={({ pressed }) => ({
                flex: 1,
                borderRadius: 18,
                paddingVertical: 14,
                paddingHorizontal: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: primaryActionColor,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: primaryActionTextColor, fontSize: 15, fontWeight: "800" }}>
                Continue Reading
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
