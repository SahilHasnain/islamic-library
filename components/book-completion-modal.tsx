import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, Text, View } from "react-native";

type BookCompletionModalProps = {
    visible: boolean;
    bookTitle: string;
    totalPages: number;
    finalPage: number;
    panelColor: string;
    panelTextColor: string;
    mutedTextColor: string;
    primaryActionColor: string;
    primaryActionTextColor: string;
    secondaryActionColor: string;
    onMarkCompleted: () => void;
    onKeepReading: () => void;
};

const CELEBRATION_MESSAGES = [
    "You've reached the end!",
    "What a journey!",
    "Congratulations!",
    "Well done!",
];

export function BookCompletionModal({
    visible,
    bookTitle,
    totalPages,
    finalPage,
    panelColor,
    panelTextColor,
    mutedTextColor,
    primaryActionColor,
    primaryActionTextColor,
    secondaryActionColor,
    onMarkCompleted,
    onKeepReading,
}: BookCompletionModalProps) {
    const celebrationMessage =
        CELEBRATION_MESSAGES[Math.floor(Math.random() * CELEBRATION_MESSAGES.length)];

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeepReading}>
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
                            {celebrationMessage}
                        </Text>
                        <Text
                            style={{
                                color: mutedTextColor,
                                fontSize: 16,
                                lineHeight: 24,
                                textAlign: "center",
                            }}
                        >
                            You have reached the end of {bookTitle}
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
                        <View
                            style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                alignItems: "center",
                            }}
                        >
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
                                <Text style={{ color: mutedTextColor, fontSize: 16 }}>Total pages</Text>
                            </View>
                            <Text style={{ color: panelTextColor, fontSize: 18, fontWeight: "800" }}>
                                {totalPages}
                            </Text>
                        </View>

                        <View
                            style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                alignItems: "center",
                            }}
                        >
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
                                    <Ionicons name="bookmark" size={18} color={panelTextColor} />
                                </View>
                                <Text style={{ color: mutedTextColor, fontSize: 16 }}>Final page</Text>
                            </View>
                            <Text style={{ color: panelTextColor, fontSize: 18, fontWeight: "800" }}>
                                {finalPage}
                            </Text>
                        </View>
                    </View>

                    <View style={{ flexDirection: "row", gap: 12, width: "100%", justifyContent: "flex-end" }}>
                        <Pressable
                            onPress={onKeepReading}
                            style={({ pressed }) => ({
                                flex: 1,
                                borderRadius: 18,
                                paddingVertical: 14,
                                paddingHorizontal: 14,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: secondaryActionColor,
                                borderWidth: 1,
                                borderColor: "rgba(127, 127, 127, 0.22)",
                                opacity: pressed ? 0.75 : 1,
                            })}
                        >
                            <Text style={{ color: panelTextColor, fontSize: 15, fontWeight: "700" }}>
                                Continue Reading
                            </Text>
                        </Pressable>

                        <Pressable
                            onPress={onMarkCompleted}
                            style={({ pressed }) => ({
                                flex: 1,
                                borderRadius: 18,
                                paddingVertical: 14,
                                paddingHorizontal: 14,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: primaryActionColor,
                                opacity: pressed ? 0.75 : 1,
                            })}
                        >
                            <Text
                                style={{
                                    color: primaryActionTextColor,
                                    fontSize: 15,
                                    fontWeight: "800",
                                }}
                            >
                                Mark Completed
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
