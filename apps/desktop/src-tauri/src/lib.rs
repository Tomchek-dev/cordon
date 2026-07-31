use tauri::{
  image::Image,
  menu::{Menu, MenuItem},
  tray::TrayIconBuilder,
  AppHandle, Manager, State, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

const ICON_NORMAL: &[u8] = include_bytes!("../icons/tray-icon.png");
const ICON_UNREAD: &[u8] = include_bytes!("../icons/tray-icon-unread.png");

struct TrayHandle(tauri::tray::TrayIcon);

#[tauri::command]
fn set_unread_count(app: AppHandle, count: u32) -> Result<(), String> {
  let tray: State<TrayHandle> = app.state();
  let icon_bytes = if count > 0 { ICON_UNREAD } else { ICON_NORMAL };
  let icon = Image::from_bytes(icon_bytes).map_err(|e| e.to_string())?;
  tray.0.set_icon(Some(icon)).map_err(|e| e.to_string())?;
  let tooltip = if count > 0 {
    format!("Internal Chat ({count} unread)")
  } else {
    "Internal Chat".to_string()
  };
  tray.0.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())?;
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_autostart::init(
      MacosLauncher::LaunchAgent,
      Some(vec![]),
    ))
    .plugin(tauri_plugin_notification::init())
    .invoke_handler(tauri::generate_handler![set_unread_count])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Enable launch-on-login by default for this internal tool, unless the
      // user has already made an explicit choice (don't stomp on a disable).
      let autolaunch = app.autolaunch();
      if !autolaunch.is_enabled().unwrap_or(true) {
        let _ = autolaunch.enable();
      }

      let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
      let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

      let icon = Image::from_bytes(ICON_NORMAL)?;
      let tray = TrayIconBuilder::new()
        .icon(icon)
        .tooltip("Internal Chat")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "show" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
          "quit" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let tauri::tray::TrayIconEvent::Click {
            button: tauri::tray::MouseButton::Left,
            button_state: tauri::tray::MouseButtonState::Up,
            ..
          } = event
          {
            let app = tray.app_handle();
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
        })
        .build(app)?;

      app.manage(TrayHandle(tray));

      Ok(())
    })
    .on_window_event(|window, event| {
      // Keep the app running in the tray instead of quitting when the window
      // is closed - PTT/notifications should keep working while minimized.
      if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
