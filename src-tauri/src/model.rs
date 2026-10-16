use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
pub type Result<T> = std::result::Result<T, String>;
pub fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
pub fn fail<T>(message: &str) -> Result<T> {
    Err(message.into())
}
pub fn err(error: impl std::fmt::Display) -> String {
    error.to_string()
}
pub fn default_settings() -> Value {
    serde_json::json!({"theme":"system","defaultMode":"paper","defaultPaper":"dotted","paperColor":"#fffdf8","defaultZoom":0.7})
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Notebook {
    pub id: String,
    pub title: String,
    pub color: String,
    pub icon: String,
    pub favorite: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub id: String,
    pub notebook_id: String,
    pub title: String,
    pub mode: String,
    pub paper: String,
    pub size: String,
    pub paper_color: String,
    #[serde(rename = "order")]
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_opened_at: i64,
    pub deleted_at: Option<i64>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct File {
    pub id: String,
    #[serde(rename = "dataURL")]
    pub data_url: String,
    pub mime_type: String,
    pub created: i64,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Content {
    pub page_id: String,
    pub elements: Vec<Value>,
    pub app_state: Value,
    pub files: BTreeMap<String, File>,
    pub initialized: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revision: Option<i64>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meta {
    pub key: String,
    pub value: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preference {
    pub key: String,
    pub value: Value,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportHistory {
    pub archive_fingerprint: String,
    pub source_format: String,
    pub status: String,
    pub imported_at: i64,
    pub summary: Value,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveData {
    pub app: String,
    pub version: u32,
    pub created_at: i64,
    pub notebooks: Vec<Notebook>,
    pub pages: Vec<Page>,
    pub contents: Vec<Content>,
    pub settings: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub creative: Option<Value>,
    #[serde(default)]
    pub metadata: Vec<Meta>,
    #[serde(default)]
    pub preferences: Vec<Preference>,
    #[serde(default)]
    pub import_history: Vec<ImportHistory>,
}
#[derive(Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Request {
    Initialize,
    ListNotebooks,
    ListPages {
        notebook_id: Option<String>,
    },
    GetNotebook {
        id: String,
    },
    GetPage {
        id: String,
    },
    Settings,
    UpdateSettings {
        value: Value,
    },
    GetMeta {
        key: String,
    },
    SetMeta {
        key: String,
        value: String,
    },
    CompareMeta {
        key: String,
        expected: Option<String>,
        value: String,
    },
    CreateNotebook {
        title: String,
        color: String,
        icon: String,
    },
    UpdateNotebook {
        id: String,
        updates: Value,
    },
    TrashNotebook {
        id: String,
    },
    RestoreNotebook {
        id: String,
    },
    DeleteNotebook {
        id: String,
    },
    CreatePage {
        page: Page,
        content: Content,
    },
    UpdatePage {
        id: String,
        updates: Value,
    },
    Opened {
        id: String,
    },
    LoadContent {
        id: String,
    },
    SaveContent {
        content: Content,
        expected_revision: i64,
        #[serde(default)]
        file_ids: Option<Vec<String>>,
    },
    DuplicatePage {
        id: String,
        target_notebook: Option<String>,
    },
    DuplicateNotebook {
        id: String,
    },
    Reorder {
        id: String,
        direction: i32,
    },
    ReadSnapshot,
}
