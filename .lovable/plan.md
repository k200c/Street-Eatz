

# Fix Smart Content Studio: Multi-File Carousel Upload

## Summary

Update the Smart Content Studio to properly support multi-file carousel uploads with validation, better UI feedback, and consistent webhook payload handling.

---

## Current State Analysis

The current implementation already has:
- `multiple={postType === 'carousel'}` on the file input (correct)
- `uploadedFiles: File[]` state (correct array type)
- `FILE_LIMITS` config with carousel limits: `{ min: 2, max: 10 }` (correct)
- Hook already handles `files: File[]` and sends `media_urls` as array

**What's Missing:**
1. No validation blocking submission when carousel has < 2 files
2. No individual filename display in UI
3. Need to show better feedback for selected files

---

## Implementation Plan

### 1. Update SocialMediaManager.tsx - Add Validation & File List UI

**A) Add Validation Before Submit (lines 108-111)**

Add a validation check at the start of `handleSubmit` to prevent carousel posts with < 2 images:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!contentIdea.trim()) return;
  
  // NEW: Validate file count for carousel
  if (!useAiVisuals && postType === 'carousel') {
    if (uploadedFiles.length < 2) {
      toast.error('Carousel needs at least 2 images');
      return;
    }
    if (uploadedFiles.length > 10) {
      toast.error('Maximum 10 images allowed for carousel');
      return;
    }
  }
  
  // Validate single/video has at least 1 file
  if (!useAiVisuals && (postType === 'single' || postType === 'video')) {
    if (uploadedFiles.length === 0) {
      toast.error(`Please upload a ${postType === 'video' ? 'video' : 'image'}`);
      return;
    }
  }

  setUploading(true);
  // ... rest of handler
};
```

**B) Improve Post Type Change Handler (lines 226-229)**

When switching post types, intelligently handle files:

```typescript
onClick={() => {
  const prevType = postType;
  setPostType(type.value);
  
  // Smart file handling on type change
  if (type.value === 'single' || type.value === 'video') {
    // Keep only first file for single/video
    setUploadedFiles(prev => prev.length > 0 ? [prev[0]] : []);
  } else if (type.value === 'carousel' && prevType !== 'carousel') {
    // Switching TO carousel - keep existing files
    // No change needed, allow adding more
  }
  
  // Clear if switching to incompatible format (video <-> image)
  if ((prevType === 'video' && type.value !== 'video') || 
      (prevType !== 'video' && type.value === 'video')) {
    setUploadedFiles([]);
  }
}}
```

**C) Enhance File Display UI (lines 286-294)**

Replace the simple count display with a file list showing names:

```tsx
{uploadedFiles.length > 0 && (
  <div className="space-y-2">
    <div className="flex items-center gap-2 text-sm text-success">
      <Check className="w-4 h-4" />
      {uploadedFiles.length} file(s) selected
      {uploadedFiles.length < fileLimits.min && (
        <span className="text-amber-500 ml-2">
          (Need at least {fileLimits.min})
        </span>
      )}
      {uploadedFiles.length > fileLimits.max && (
        <span className="text-destructive ml-2">
          (Max {fileLimits.max})
        </span>
      )}
    </div>
    
    {/* File list with remove buttons */}
    <div className="flex flex-wrap gap-2">
      {uploadedFiles.map((file, index) => (
        <div 
          key={`${file.name}-${index}`}
          className="flex items-center gap-1 px-2 py-1 bg-secondary/50 rounded-md text-xs"
        >
          <span className="max-w-[120px] truncate">{file.name}</span>
          <button
            type="button"
            onClick={() => {
              setUploadedFiles(prev => prev.filter((_, i) => i !== index));
            }}
            className="text-muted-foreground hover:text-destructive p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  </div>
)}
```

**D) Add X Icon Import (line 4)**

Add `X` to the lucide-react import:

```typescript
import { 
  Trash2, Upload, Calendar, Image, Film, Layers, Sparkles, 
  AlertCircle, RefreshCw, Loader2, Check, Clock, Wand2, ImagePlus, X
} from 'lucide-react';
```

---

### 2. Update useSocialMediaPosts.ts - Improve Upload Naming

**A) Update uploadFiles function (lines 144-169)**

Add postId parameter for consistent naming:

```typescript
const uploadFiles = async (files: File[], postId: string): Promise<string[]> => {
  const urls: string[] = [];
  
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const fileExt = file.name.split('.').pop();
    const fileName = `${postId}-${index}-${Date.now()}.${fileExt}`;
    const filePath = `posts/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('social-media-content')
      .upload(filePath, file);

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    const { data: urlData } = supabase.storage
      .from('social-media-content')
      .getPublicUrl(filePath);

    urls.push(urlData.publicUrl);
  }

  return urls;
};
```

**B) Update generateDraftMutation to pass postId (lines 193-197)**

Generate UUID first, then pass to upload:

```typescript
// Generate UUID BEFORE upload so we can use it in filenames
const newId = crypto.randomUUID();

if (aiPreference === 'upload_media' && files && files.length > 0) {
  console.log("📤 Uploading", files.length, "media files with postId:", newId);
  const uploadResult = await uploadFiles(files, newId);
  finalMediaUrls = Array.isArray(uploadResult) ? uploadResult : [];
}

if (aiPreference === 'generate_ai' && referenceFile) {
  console.log("📤 Uploading reference image...");
  const uploadResult = await uploadFiles([referenceFile], `ref-${newId}`);
  finalReferenceUrl = uploadResult[0] || null;
}
```

**C) Same for schedulePostMutation (lines 317-321)**

```typescript
const newId = crypto.randomUUID();

if (aiPreference === 'upload_media' && files && files.length > 0) {
  const uploadResult = await uploadFiles(files, newId);
  mediaUrls = Array.isArray(uploadResult) ? uploadResult : [];
}
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/components/staff/SocialMediaManager.tsx` | Add X icon import, validation in handleSubmit, smart post type switching, file list with remove buttons |
| `src/hooks/useSocialMediaPosts.ts` | Update uploadFiles to accept postId, generate UUID before upload |

---

## Validation Rules

| Post Type | Min Files | Max Files | Accept |
|-----------|-----------|-----------|--------|
| Single | 1 | 1 | image/* |
| Carousel | 2 | 10 | image/* |
| Video | 1 | 1 | video/* |

---

## Webhook Payload (Unchanged Format)

The webhook payload format remains the same - `media_urls` is already an array:

```json
{
  "post_id": "uuid-here",
  "idea": "Content idea text",
  "brief": "Brief text",
  "post_type": "carousel",
  "ai_preference": "upload_media",
  "media_urls": [
    "https://storage.url/posts/uuid-0-timestamp.jpg",
    "https://storage.url/posts/uuid-1-timestamp.jpg",
    "https://storage.url/posts/uuid-2-timestamp.jpg"
  ],
  "visual_prompt": null,
  "reference_image_url": null
}
```

---

## Testing Checklist

1. **Single Post**: Can only select 1 image, shows file name, submits correctly
2. **Carousel**: Can select 2-10 images, shows all filenames, blocks submission if < 2
3. **Video**: Can only select 1 video, shows file name, uses `accept="video/*"`
4. **Type Switching**: 
   - From carousel (3 files) to single = keeps only first file
   - From video to single/carousel = clears files (format change)
5. **Remove Files**: Individual files can be removed via X button
6. **Webhook**: Verify n8n receives `media_urls` as array with correct URLs

