import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

// Read Supabase config from local.properties (gitignored) so keys aren't
// committed. The publishable/anon key is client-safe (RLS protects the data).
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun secret(name: String): String = (localProps.getProperty(name) ?: "").trim()

android {
    namespace = "com.rhozly.wear"
    compileSdk = 35

    defaultConfig {
        // Same applicationId as the Capacitor phone app → one Play listing later.
        applicationId = "com.rhozly.app"
        minSdk = 30      // Wear OS 3+
        targetSdk = 34   // Wear OS 5
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "SUPABASE_URL", "\"${secret("SUPABASE_URL")}\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"${secret("SUPABASE_ANON_KEY")}\"")
        // Google OAuth web client id (public, client-safe) — used as the serverClientId
        // for native "Sign in with Google" so the ID token's audience matches Supabase.
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"${secret("GOOGLE_WEB_CLIENT_ID")}\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.core.ktx)
    implementation(libs.lifecycle.runtime.ktx)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.activity.compose)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material) // Modifier.pullRefresh only
    implementation(libs.wear.compose.material)
    implementation(libs.wear.compose.foundation)

    // Supabase (auth; postgrest to resolve the home; functions for
    // get-today-tasks / mutate-task; realtime for live task auto-refresh).
    implementation(platform(libs.supabase.bom))
    implementation(libs.supabase.auth)
    implementation(libs.supabase.postgrest)
    implementation(libs.supabase.functions)
    implementation(libs.supabase.realtime)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.kotlinx.serialization.json)

    // Offline: Room (local cache + write queue) + WorkManager (background flush).
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)
    implementation(libs.work.runtime.ktx)
    implementation(libs.play.app.update)

    // Native "Sign in with Google": Credential Manager gets a Google ID token,
    // which we hand to Supabase (signInWith(IDToken)) to reuse the web app's provider.
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services)
    implementation(libs.google.identity.googleid)

    debugImplementation(libs.compose.ui.tooling)
}
