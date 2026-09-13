package in.axzen.store.preview;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;

/** A separate installable preview of the live storefront; no native credential bridge. */
public final class MainActivity extends Activity {
    private static final Uri STORE = Uri.parse("https://www.axzen.in/");
    private TextView status;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setGravity(Gravity.CENTER);
        int space = Math.round(24 * getResources().getDisplayMetrics().density);
        page.setPadding(space, space, space, space);
        page.setFitsSystemWindows(true);
        page.setBackgroundColor(Color.rgb(16, 42, 67));

        TextView title = new TextView(this);
        title.setText(R.string.app_name);
        title.setTextSize(36);
        title.setTextColor(Color.WHITE);
        title.setGravity(Gravity.CENTER);
        page.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText(R.string.tagline);
        subtitle.setTextSize(18);
        subtitle.setTextColor(Color.WHITE);
        subtitle.setPadding(0, space / 2, 0, space);
        page.addView(subtitle);

        Button open = new Button(this);
        open.setText(R.string.open_store);
        open.setTextColor(Color.WHITE);
        open.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(255, 87, 51)));
        open.setOnClickListener(view -> openStore());
        page.addView(open, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        status = new TextView(this);
        status.setText(R.string.preview_note);
        status.setTextColor(Color.rgb(210, 220, 230));
        status.setTextSize(14);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, space, 0, 0);
        page.addView(status);
        setContentView(page);
        if (state == null) openStore();
    }

    private void openStore() {
        CustomTabsIntent tab = new CustomTabsIntent.Builder()
            .setDefaultColorSchemeParams(new CustomTabColorSchemeParams.Builder()
                .setToolbarColor(Color.rgb(16, 42, 67)).build())
            .setColorScheme(CustomTabsIntent.COLOR_SCHEME_LIGHT)
            .setShowTitle(true)
            .build();
        try {
            tab.launchUrl(this, STORE);
            status.setText(R.string.preview_note);
        } catch (ActivityNotFoundException unavailable) {
            status.setText(R.string.browser_missing);
        }
    }
}
