import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

interface NitroButtonProps {
  ws: WebSocket | null;
}

export function NitroButton({ ws }: NitroButtonProps) {
  const [active, setActive] = useState(false);

  const scale = useRef(new Animated.Value(1)).current;

  const fireNitro = () => {
    try {
      // SEND TO PC
      if (ws && ws.readyState === 1) {
        ws.send(
          JSON.stringify({
            type: "button",
            id: "NITRO",
            action: "click",
          }),
        );

        console.log("Nitro sent");
      } else {
        console.log("WebSocket not connected");
      }

      // HAPTIC
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      // BUTTON ANIMATION
      setActive(true);

      Animated.sequence([
        Animated.timing(scale, {
          toValue: 0.9,
          duration: 60,
          useNativeDriver: true,
        }),

        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 80,
          bounciness: 6,
        }),
      ]).start();

      setTimeout(() => {
        setActive(false);
      }, 250);
    } catch (err) {
      console.log("Nitro error:", err);
    }
  };

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={{
          transform: [{ scale }],
        }}
      >
        <Pressable
          onPress={fireNitro}
          style={[styles.button, active && styles.buttonActive]}
        >
          <Text style={[styles.icon, active && styles.iconActive]}>⚡</Text>

          <Text style={[styles.label, active && styles.labelActive]}>
            NITRO
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
  },

  button: {
    width: 100,
    height: 100,

    borderRadius: 20,

    borderWidth: 2,
    borderColor: "#fbbf24",

    backgroundColor: "#120d00",

    justifyContent: "center",
    alignItems: "center",
  },

  buttonActive: {
    borderColor: "#f59e0b",
    backgroundColor: "#1f1400",
  },

  icon: {
    fontSize: 28,
    color: "#fbbf24",
  },

  iconActive: {
    color: "#f59e0b",
  },

  label: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "bold",
    color: "#fbbf24",
    letterSpacing: 1,
  },

  labelActive: {
    color: "#f59e0b",
  },
});
