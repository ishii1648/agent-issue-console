use sha2::{Digest, Sha256};

pub fn normalize_request(value: &str) -> String {
    // Fingerprintの再現性に必要なASCII幅だけを依存追加なしで正規化する。
    // 日本語本文はそのまま保持し、全角ASCIIと全角spaceは互換文字へ寄せる。
    let width_normalized = value
        .chars()
        .map(|character| match character {
            '\u{3000}' => ' ',
            '\u{ff01}'..='\u{ff5e}' => {
                char::from_u32(character as u32 - 0xfee0).expect("全角ASCIIの変換結果は有効")
            }
            _ => character,
        })
        .collect::<String>();
    let mut normalized = width_normalized
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    while normalized
        .chars()
        .last()
        .is_some_and(|value| matches!(value, '.' | '!' | '?' | '。' | '！' | '？'))
    {
        normalized.pop();
    }
    normalized.trim().to_string()
}

pub fn create_fingerprint(repository: &str, request: &str, identifiers: &[String]) -> String {
    let mut stable = identifiers
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    stable.sort_unstable();
    stable.dedup();
    let input = format!(
        "v1\n{}\n{}\n{}",
        repository.to_lowercase(),
        normalize_request(request),
        stable.join("\n")
    );
    format!("{:x}", Sha256::digest(input.as_bytes()))
}

pub fn fingerprint_marker(fingerprint: &str) -> String {
    format!("<!-- agent-issue-console:fingerprint={fingerprint} -->")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprintは再送と識別子順序に対して安定する() {
        let a = create_fingerprint("OWNER/Repo", "  Improve API!  ", &["b".into(), "a".into()]);
        let b = create_fingerprint("owner/repo", "improve api", &["a".into(), "b".into()]);
        assert_eq!(a, b);
        assert_eq!(a.len(), 64);
        assert_eq!(normalize_request("  Ａ  TEST。 "), "a test");
    }
}
