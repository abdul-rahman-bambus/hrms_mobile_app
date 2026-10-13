package bambus.hrms.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FaceOverlay")
public class FaceOverlayPlugin extends Plugin {
    private FaceOverlayView overlayView;

    @Override
    public void load() {
        super.load();
        getActivity().runOnUiThread(() -> {
            overlayView = new FaceOverlayView(getContext());
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
            );
            ((ViewGroup) getBridge().getWebView().getParent()).addView(overlayView, params);
            overlayView.setElevation(100f);
            overlayView.bringToFront();
        });
    }

    @PluginMethod
    public void drawRectangle(PluginCall call) {
        float x = call.getDouble("x", 0.0).floatValue();
        float y = call.getDouble("y", 0.0).floatValue();
        float width = call.getDouble("width", 0.0).floatValue();
        float height = call.getDouble("height", 0.0).floatValue();
        float imageWidth = call.getDouble("imageWidth", 1.0).floatValue();
        float imageHeight = call.getDouble("imageHeight", 1.0).floatValue();
        
        float frameLeft = call.getDouble("frameLeft", 0.0).floatValue();
        float frameTop = call.getDouble("frameTop", 0.0).floatValue();
        float frameWidth = call.getDouble("frameWidth", 10000.0).floatValue();
        float frameHeight = call.getDouble("frameHeight", 10000.0).floatValue();
        
        getActivity().runOnUiThread(() -> {
            if (overlayView != null) {
                overlayView.setRect(x, y, width, height, imageWidth, imageHeight, frameLeft, frameTop, frameWidth, frameHeight);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void clearRectangle(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (overlayView != null) {
                overlayView.clear();
            }
            call.resolve();
        });
    }

    private static class FaceOverlayView extends View {
        private Paint paint;
        private RectF rect;
        private float imgW = 1f;
        private float imgH = 1f;
        private boolean showRect = false;

        private RectF clipRect = null;

        public FaceOverlayView(Context context) {
            super(context);
            paint = new Paint();
            paint.setColor(Color.GREEN);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(12f);
        }

        public void setRect(float x, float y, float width, float height, float imageWidth, float imageHeight, float frameL, float frameT, float frameW, float frameH) {
            this.rect = new RectF(x, y, x + width, y + height);
            this.imgW = imageWidth;
            this.imgH = imageHeight;
            this.clipRect = new RectF(frameL, frameT, frameL + frameW, frameT + frameH);
            this.showRect = true;
            invalidate();
        }

        public void clear() {
            this.showRect = false;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            if (showRect && rect != null) {
                if (clipRect != null) {
                    canvas.save();
                    // Add 1.5rem (approx 24dp) border radius clipping
                    android.graphics.Path clipPath = new android.graphics.Path();
                    float density = getResources().getDisplayMetrics().density;
                    float radius = 24f * density;
                    clipPath.addRoundRect(clipRect, radius, radius, android.graphics.Path.Direction.CW);
                    canvas.clipPath(clipPath);
                }

                float viewWidth = getWidth();
                float viewHeight = getHeight();
                
                // CameraX uses CENTER_CROP (FILL_CENTER) by default.
                // We must scale the image proportionally to fill the view, and center it.
                float scale = Math.max(viewWidth / imgW, viewHeight / imgH);
                float scaledImgW = imgW * scale;
                float scaledImgH = imgH * scale;
                
                float dx = (viewWidth - scaledImgW) / 2f;
                float dy = (viewHeight - scaledImgH) / 2f;
                
                float mirroredX = imgW - (rect.left + rect.width());
                float left = (mirroredX * scale) + dx;
                float top = (rect.top * scale) + dy;
                float right = ((mirroredX + rect.width()) * scale) + dx;
                float bottom = (rect.bottom * scale) + dy;
                
                RectF mappedRect = new RectF(left, top, right, bottom);
                canvas.drawRect(mappedRect, paint);
                
                if (clipRect != null) {
                    canvas.restore();
                }
            }
        }
    }
}
