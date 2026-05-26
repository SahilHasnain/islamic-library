import { useState } from "react";
import { Image, type ImageSourcePropType, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

type ZoomableReaderImageProps = {
  source: ImageSourcePropType;
  width: number;
  height: number;
  onPress?: () => void;
  onZoomChange?: (isZoomed: boolean) => void;
  onError?: () => void;
};

export function ZoomableReaderImage({
  source,
  width,
  height,
  onPress,
  onZoomChange,
  onError,
}: ZoomableReaderImageProps) {
  const [isPanEnabled, setIsPanEnabled] = useState(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  function clamp(value: number, min: number, max: number) {
    "worklet";
    return Math.min(Math.max(value, min), max);
  }

  function getPanBounds(currentScale: number) {
    "worklet";
    const horizontal = Math.max(0, ((width * currentScale) - width) / 2);
    const vertical = Math.max(0, ((height * currentScale) - height) / 2);
    return {
      minX: -horizontal,
      maxX: horizontal,
      minY: -vertical,
      maxY: vertical,
    };
  }

  function notifyZoomChange(isZoomed: boolean) {
    setIsPanEnabled(isZoomed);
    onZoomChange?.(isZoomed);
  }

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      const nextScale = clamp(savedScale.value * event.scale, 1, 3);
      scale.value = nextScale;

      const bounds = getPanBounds(nextScale);
      translateX.value = clamp(savedTranslateX.value, bounds.minX, bounds.maxX);
      translateY.value = clamp(savedTranslateY.value, bounds.minY, bounds.maxY);
    })
    .onEnd(() => {
      savedScale.value = clamp(scale.value, 1, 3);
      scale.value = withSpring(savedScale.value);

      if (savedScale.value <= 1) {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        const bounds = getPanBounds(savedScale.value);
        const nextX = clamp(translateX.value, bounds.minX, bounds.maxX);
        const nextY = clamp(translateY.value, bounds.minY, bounds.maxY);
        translateX.value = withSpring(nextX);
        translateY.value = withSpring(nextY);
        savedTranslateX.value = nextX;
        savedTranslateY.value = nextY;
      }

      runOnJS(notifyZoomChange)(savedScale.value > 1);
    });

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .activeOffsetY([-10, 10])
    .onUpdate((event) => {
      if (savedScale.value <= 1) {
        return;
      }

      const bounds = getPanBounds(savedScale.value);
      translateX.value = clamp(savedTranslateX.value + event.translationX, bounds.minX, bounds.maxX);
      translateY.value = clamp(savedTranslateY.value + event.translationY, bounds.minY, bounds.maxY);
    })
    .onEnd(() => {
      if (savedScale.value <= 1) {
        return;
      }

      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const tapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (onPress) {
        runOnJS(onPress)();
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(notifyZoomChange)(false);
        return;
      }

      scale.value = withSpring(2);
      savedScale.value = 2;
      runOnJS(notifyZoomChange)(true);
    });

  const composedGesture = Gesture.Race(
    doubleTapGesture,
    Gesture.Simultaneous(tapGesture, pinchGesture, panGesture.enabled(isPanEnabled)),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={{ width, height }}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={[{ width, height }, animatedStyle]}>
          <Image
            source={source}
            resizeMode="contain"
            style={{ width, height }}
            onError={onError}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
