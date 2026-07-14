interface CountEditControllerOptions {
  current: MaybeRefOrGetter<number>;
  max: MaybeRefOrGetter<number>;
  min?: MaybeRefOrGetter<number>;
  onUpdate: (value: number) => void;
  externalChangeBehavior?: 'cancel' | 'replace';
  onExternalChange?: (value: number, previous: number | undefined) => void;
}
interface CountEditController {
  isEditing: Ref<boolean>;
  editValue: Ref<number>;
  inputRef: Ref<HTMLInputElement | null>;
  startEdit: () => void;
  commitEdit: () => void;
  cancelEdit: () => void;
  increase: () => void;
  decrease: () => void;
  canIncrease: Ref<boolean>;
  canDecrease: Ref<boolean>;
}
export function useCountEditController(options: CountEditControllerOptions): CountEditController {
  const isEditing = ref(false);
  const editValue = ref(0);
  const inputRef = ref<HTMLInputElement | null>(null);
  const minValue = () => toValue(options.min) ?? 0;
  const maxValue = () => toValue(options.max);
  const currentValue = () => toValue(options.current);
  const canIncrease = computed(() => currentValue() < maxValue());
  const canDecrease = computed(() => currentValue() > minValue());
  const startEdit = () => {
    editValue.value = currentValue();
    isEditing.value = true;
    nextTick(() => {
      inputRef.value?.focus();
      inputRef.value?.select();
    });
  };
  const commitEdit = () => {
    if (isEditing.value) {
      const clamped = Math.floor(Math.min(maxValue(), Math.max(minValue(), editValue.value || 0)));
      isEditing.value = false;
      options.onUpdate(clamped);
    }
  };
  const cancelEdit = () => {
    isEditing.value = false;
  };
  const increase = () => {
    if (canIncrease.value) {
      options.onUpdate(currentValue() + 1);
    }
  };
  const decrease = () => {
    if (canDecrease.value) {
      options.onUpdate(currentValue() - 1);
    }
  };
  watch(
    () => currentValue(),
    (value, previous) => {
      if (!isEditing.value) return;
      if (options.externalChangeBehavior === 'cancel') {
        isEditing.value = false;
        return;
      }
      const priorEditValue = editValue.value;
      editValue.value = value;
      if (priorEditValue !== value) {
        options.onExternalChange?.(value, previous);
      }
    }
  );
  return {
    isEditing,
    editValue,
    inputRef,
    startEdit,
    commitEdit,
    cancelEdit,
    increase,
    decrease,
    canIncrease,
    canDecrease,
  };
}
