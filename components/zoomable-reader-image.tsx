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
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  function notifyZoomChange(isZoomed: boolean) {
    onZoomChange?.(isZoomed);
  }

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = savedScale.value * event.scale;
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        runOnJS(notifyZoomChange)(false);
        return;
      }

      if (scale.value > 3) {
        scale.value = withSpring(3);
        savedScale.value = 3;
        runOnJS(notifyZoomChange)(true);
        return;
      }

      savedScale.value = scale.value;
      runOnJS(notifyZoomChange)(scale.value > 1);
    });

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .activeOffsetY([-10, 10])
    .enabled(savedScale.value > 1)
    .onUpdate((event) => {
      if (savedScale.value <= 1) {
        return;
      }

      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
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
    Gesture.Simultaneous(tapGesture, pinchGesture, Gesture.Race(panGesture)),
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
