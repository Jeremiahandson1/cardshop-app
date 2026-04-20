import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import { collectionsApi } from '../services/api';
import { Button, ScreenHeader, SectionHeader, Divider } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

// Save a CSV string to a temp file and open the native share sheet.
const shareCsv = async (csvText, filename) => {
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, csvText, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    Alert.alert('Saved', `File saved to:\n${uri}`);
    return;
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'text/csv',
    dialogTitle: filename,
    UTI: 'public.comma-separated-values-text',
  });
};

const timestamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
};

export const CollectionImportExportScreen = ({ navigation }) => {
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [picking, setPicking] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [includePrices, setIncludePrices] = useState(false);

  // ---- Template --------------------------------------------------------
  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const res = await collectionsApi.template();
      await shareCsv(res.data, 'cardshop-import-template.csv');
    } catch (err) {
      Alert.alert(
        'Download failed',
        err?.response?.data?.error || err?.message || 'Could not download the template. Try again.',
      );
    } finally {
      setDownloadingTemplate(false);
    }
  };

  // ---- Import ----------------------------------------------------------
  const handlePickFile = async () => {
    setPicking(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      // SDK 50+ returns { canceled, assets: [...] }
      if (res.canceled) return;
      const asset = res.assets?.[0] || res;
      if (!asset?.uri) return;
      setSelectedFile({
        uri: asset.uri,
        name: asset.name || 'collection.csv',
        mimeType: asset.mimeType || 'text/csv',
        size: asset.size,
      });
      setImportResult(null);
    } catch (err) {
      Alert.alert('Could not open file', err?.message || 'Try a different file.');
    } finally {
      setPicking(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setImportResult(null);
    try {
      const res = await collectionsApi.import(selectedFile);
      setImportResult(res.data || { created: 0, skipped: 0, duplicates: 0, errors: [] });
      setErrorsOpen(false);
    } catch (err) {
      Alert.alert(
        'Import failed',
        err?.response?.data?.error || err?.message || 'Something went wrong uploading that file.',
      );
    } finally {
      setUploading(false);
    }
  };

  // ---- Export ----------------------------------------------------------
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await collectionsApi.export({ includePrices });
      const name = `cardshop-collection-${timestamp()}${includePrices ? '-with-prices' : ''}.csv`;
      await shareCsv(res.data, name);
    } catch (err) {
      Alert.alert(
        'Export failed',
        err?.response?.data?.error || err?.message || 'Could not export your collection. Try again.',
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Import / Export"
        subtitle="Move your collection in and out as CSV"
        right={
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.closeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={22} color={Colors.text} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xxxl }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Notice */}
        <View style={styles.notice}>
          <Ionicons name="information-circle" size={18} color={Colors.info} style={{ marginTop: 1 }} />
          <Text style={styles.noticeText}>
            Imported cards appear in Set Completion but must be scanned before they can be listed on the trade board.
          </Text>
        </View>

        {/* Template */}
        <SectionHeader title="1. Download Template" />
        <Text style={styles.blurb}>
          Start from a blank CSV with the required columns and two example rows.
        </Text>
        <Button
          title={downloadingTemplate ? 'Preparing...' : 'Download CSV Template'}
          onPress={handleDownloadTemplate}
          loading={downloadingTemplate}
          variant="secondary"
          icon={<Ionicons name="download-outline" size={18} color={Colors.text} />}
        />

        <Divider style={{ marginVertical: Spacing.lg }} />

        {/* Import */}
        <SectionHeader title="2. Import Cards" />
        <Text style={styles.blurb}>
          Pick a .csv file (max 10 MB, 10,000 rows). Required columns: sport, year, brand_set, card_number, player_subject.
        </Text>

        <TouchableOpacity
          style={styles.fileCard}
          onPress={handlePickFile}
          disabled={picking || uploading}
          activeOpacity={0.85}
        >
          <Ionicons
            name={selectedFile ? 'document-text' : 'document-text-outline'}
            size={22}
            color={selectedFile ? Colors.accent : Colors.textMuted}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.fileName} numberOfLines={1}>
              {selectedFile ? selectedFile.name : 'Choose a CSV file'}
            </Text>
            {selectedFile?.size != null && (
              <Text style={styles.fileMeta}>
                {(selectedFile.size / 1024).toFixed(1)} KB
              </Text>
            )}
          </View>
          {picking ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Ionicons name="folder-open-outline" size={18} color={Colors.textMuted} />
          )}
        </TouchableOpacity>

        <Button
          title={uploading ? 'Uploading...' : 'Upload & Import'}
          onPress={handleUpload}
          loading={uploading}
          disabled={!selectedFile || uploading}
          style={{ marginTop: Spacing.md }}
          icon={<Ionicons name="cloud-upload-outline" size={18} color={Colors.bg} />}
        />

        {/* Result summary */}
        {importResult && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Import complete</Text>
            <View style={styles.resultRow}>
              <StatPill label="Created" value={importResult.created || 0} color={Colors.success} />
              <StatPill label="Skipped" value={importResult.skipped || 0} color={Colors.warning} />
              <StatPill label="Duplicates" value={importResult.duplicates || 0} color={Colors.textMuted} />
            </View>

            {Array.isArray(importResult.errors) && importResult.errors.length > 0 && (
              <View style={{ marginTop: Spacing.md }}>
                <TouchableOpacity
                  style={styles.errorToggle}
                  onPress={() => setErrorsOpen((v) => !v)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={errorsOpen ? 'chevron-down' : 'chevron-forward'}
                    size={16}
                    color={Colors.error}
                  />
                  <Text style={styles.errorToggleText}>
                    {importResult.errors.length} error{importResult.errors.length === 1 ? '' : 's'}
                  </Text>
                </TouchableOpacity>
                {errorsOpen && (
                  <View style={styles.errorList}>
                    {importResult.errors.map((e, i) => (
                      <Text key={i} style={styles.errorLine}>• {e}</Text>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        <Divider style={{ marginVertical: Spacing.lg }} />

        {/* Export */}
        <SectionHeader title="3. Export Collection" />
        <Text style={styles.blurb}>
          Download every card you own as a CSV you can open in a spreadsheet.
        </Text>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Include purchase prices</Text>
            <Text style={styles.toggleHint}>Adds the purchase_price column.</Text>
          </View>
          <Switch
            value={includePrices}
            onValueChange={setIncludePrices}
            trackColor={{ false: Colors.border, true: Colors.accent + '66' }}
            thumbColor={includePrices ? Colors.accent : Colors.textMuted}
          />
        </View>

        <Button
          title={exporting ? 'Preparing...' : 'Export Collection CSV'}
          onPress={handleExport}
          loading={exporting}
          icon={<Ionicons name="share-outline" size={18} color={Colors.bg} />}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const StatPill = ({ label, value, color }) => (
  <View style={[pillStyles.container, { borderColor: color }]}>
    <Text style={[pillStyles.value, { color }]}>{value}</Text>
    <Text style={pillStyles.label}>{label}</Text>
  </View>
);

const pillStyles = StyleSheet.create({
  container: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    backgroundColor: Colors.surface2,
  },
  value: {
    fontSize: Typography.lg,
    fontWeight: Typography.heavy,
  },
  label: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  closeBtn: {
    width: 36, height: 36, borderRadius: Radius.full,
    backgroundColor: Colors.surface2,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  notice: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.info,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  noticeText: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.sm,
    lineHeight: 20,
  },
  blurb: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    lineHeight: 19,
    marginBottom: Spacing.md,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  fileName: {
    color: Colors.text,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  fileMeta: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    marginTop: 2,
  },
  resultCard: {
    marginTop: Spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.base,
  },
  resultTitle: {
    color: Colors.text,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    marginBottom: Spacing.sm,
  },
  resultRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  errorToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorToggleText: {
    color: Colors.error,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  errorList: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    gap: 4,
  },
  errorLine: {
    color: Colors.text,
    fontSize: Typography.xs,
    fontFamily: Typography.mono,
    lineHeight: 17,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  toggleLabel: {
    color: Colors.text,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  toggleHint: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    marginTop: 2,
  },
});
