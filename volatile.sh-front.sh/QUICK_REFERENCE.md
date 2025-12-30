# volatile.sh Frontend - Quick Reference Guide

## For Developers

### Using Toast Notifications

```tsx
import { useToast } from "./components/Toast";

function MyComponent() {
  const { showToast } = useToast();

  // Success notification
  showToast("success", "Operation completed!");

  // Error notification
  showToast("error", "Something went wrong", 5000);

  // Warning notification
  showToast("warning", "Please check your input");

  // Info notification
  showToast("info", "Did you know...", 0); // No auto-dismiss
}
```

### Using Loading Components

```tsx
import { LoadingSpinner, ProgressBar, LoadingOverlay } from "./components/Loading";

// Spinner
<LoadingSpinner size="md" text="Loading..." />

// Progress bar
<ProgressBar progress={75} label="Uploading" showPercentage />

// Full-screen overlay
{isLoading && <LoadingOverlay text="PROCESSING..." />}
```

### Using API Retry

```tsx
import { fetchWithRetry, getApiErrorMessage } from "./utils/api";

try {
  const response = await fetchWithRetry("/api/endpoint", {
    method: "POST",
    body: JSON.stringify(data),
    retryConfig: {
      maxRetries: 3,
      initialDelay: 1000,
    },
    onRetry: (attempt, max, delay) => {
      showToast("warning", `Retry ${attempt}/${max}...`);
    },
  });
} catch (error) {
  const message = getApiErrorMessage(error);
  showToast("error", message);
}
```

## For Users

### Keyboard Shortcuts

- **Tab**: Navigate between elements
- **Enter/Space**: Activate buttons
- **Escape**: Close dialogs/modals
- **Skip to content**: Tab from page load to skip header

### Accessibility Features

- **Screen Readers**: Full VoiceOver/NVDA support
- **Keyboard Navigation**: Complete keyboard accessibility
- **High Contrast**: Supports high contrast mode
- **Reduced Motion**: Respects motion preferences
- **Text Scaling**: Works up to 200% zoom

### Mobile Features

- **Touch Targets**: All buttons 48px+ for easy tapping
- **Responsive Layout**: Optimized for all screen sizes
- **Clipboard**: Works on all mobile browsers
- **Offline Handling**: Clear error messages when offline

## Component API Reference

### TerminalButton

```tsx
<TerminalButton
  variant="primary" // or "danger"
  isLoading={false}
  disabled={false}
  onClick={handleClick}
  aria-label="Descriptive label"
>
  BUTTON TEXT
</TerminalButton>
```

### Toast Provider

Wrap your app:

```tsx
<ToastProvider>
  <App />
</ToastProvider>
```

### useToast Hook

```tsx
const { showToast, removeToast, toasts } = useToast();

// Show toast
showToast(type, message, duration);

// Remove specific toast
removeToast(toastId);

// Access all toasts
console.log(toasts);
```

## Error Codes Reference

| Code | Message             | Retry? |
| ---- | ------------------- | ------ |
| 400  | Invalid request     | No     |
| 401  | Unauthorized        | No     |
| 403  | Access forbidden    | No     |
| 404  | Not found           | No     |
| 413  | Payload too large   | No     |
| 429  | Rate limited        | Yes    |
| 500  | Server error        | Yes    |
| 502  | Bad gateway         | Yes    |
| 503  | Service unavailable | Yes    |
| 504  | Gateway timeout     | Yes    |

## CSS Classes Reference

### Animations

- `.animate-slide-in-right`: Slide from right
- `.animate-fade-in`: Fade in
- `.animate-scale-in`: Scale in
- `.animate-pulse-green`: Terminal pulse
- `.animation-delay-200`: 200ms delay
- `.animation-delay-400`: 400ms delay

### Utility Classes

- `.glow-text`: Terminal glow effect on text
- `.glow-border`: Terminal glow effect on borders
- `.btn-ripple`: Ripple effect on click
- `.skip-to-content`: Skip navigation link

## Best Practices

### Adding New Features

1. ✅ Add TypeScript types
2. ✅ Include ARIA labels
3. ✅ Add loading states
4. ✅ Handle errors gracefully
5. ✅ Show toast notifications
6. ✅ Test keyboard navigation
7. ✅ Check mobile responsiveness
8. ✅ Support reduced motion

### Error Handling Pattern

```tsx
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const { showToast } = useToast();

const handleAction = async () => {
  setIsLoading(true);
  setError(null);

  try {
    const result = await doSomething();
    showToast("success", "Success message!");
    return result;
  } catch (err) {
    const message = getApiErrorMessage(err);
    setError(message);
    showToast("error", message);
  } finally {
    setIsLoading(false);
  }
};
```

### Loading State Pattern

```tsx
const [loadingStatus, setLoadingStatus] = useState("");

const process = async () => {
  setLoadingStatus("STEP_1");
  await step1();

  setLoadingStatus("STEP_2");
  await step2();

  setLoadingStatus("");
};

{
  isLoading && (
    <div role="status" aria-live="polite">
      {loadingStatus === "STEP_1" && "Processing step 1..."}
      {loadingStatus === "STEP_2" && "Processing step 2..."}
    </div>
  );
}
```

## Performance Tips

1. **Large Secrets**: < 1MB recommended for best performance
2. **Network**: Retry logic handles slow connections
3. **Animations**: Automatically disabled for reduced motion
4. **Bundle Size**: Already optimized (~70KB gzipped)

## Debugging

### Enable Verbose Logging

```tsx
// Add to any component
console.log("Current state:", { isLoading, error, data });
```

### Check Toast State

```tsx
const { toasts } = useToast();
console.log("Active toasts:", toasts);
```

### Verify API Calls

```tsx
// API retry will log to console automatically
// Look for: "Retrying... (attempt X/Y)"
```

## Common Issues & Solutions

### Toast Not Showing

✅ Ensure app is wrapped in `<ToastProvider>`

### Clipboard Not Working

✅ Must use HTTPS (or localhost)
✅ Fallback handles older browsers

### Loading State Stuck

✅ Check try/finally blocks
✅ Verify setIsLoading(false) in all paths

### Accessibility Warnings

✅ Add aria-label to unlabeled buttons
✅ Use aria-hidden for decorative elements
✅ Include sr-only text for screen readers

## Testing Checklist

- [ ] Test with keyboard only
- [ ] Test with screen reader
- [ ] Test on mobile device
- [ ] Test with slow network
- [ ] Test with network interruption
- [ ] Test error states
- [ ] Test loading states
- [ ] Check console for errors
- [ ] Verify ARIA labels
- [ ] Check reduced motion

## Resources

- **Documentation**: `OPTIMIZATION_SUMMARY.md`
- **Enhancements**: `ENHANCEMENTS.md`
- **Code Examples**: See component files
- **TypeScript**: All files fully typed
