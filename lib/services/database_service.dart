import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'dart:io';
import '../models/ponto_models.dart';
import '../models/app_settings.dart';
import '../signals/app_signals.dart';

class DatabaseService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final FirebaseStorage _storage = FirebaseStorage.instance;
  final String uid;

  DatabaseService({required this.uid});

  CollectionReference get _logsRef => _db.collection('users').doc(uid).collection('logs');
  DocumentReference get _settingsRef => _db.collection('users').doc(uid);

  // Save/Update a DayLog
  Future<void> saveDayLog(DayLog log) async {
    try {
      await _logsRef.doc(log.date).set(log.toMap(), SetOptions(merge: true));
    } catch (e) {
      AppSignals.message.value = 'Erro ao salvar log: $e';
    }
  }

  // Stream of logs for the current month
  Stream<List<DayLog>> getLogs(DateTime month) {
    final start = DateTime(month.year, month.month, 1);
    final end = DateTime(month.year, month.month + 1, 0);
    
    return _logsRef
        .where('date', isGreaterThanOrEqualTo: _formatDate(start))
        .where('date', isLessThanOrEqualTo: _formatDate(end))
        .snapshots()
        .map((snap) => snap.docs.map((doc) => DayLog.fromMap(doc.data() as Map<String, dynamic>)).toList());
  }

  // Settings
  Future<void> saveSettings(AppSettings settings) async {
    try {
      await _settingsRef.update({'settings': settings.toMap()});
    } catch (e) {
      await _settingsRef.set({'settings': settings.toMap()}, SetOptions(merge: true));
    }
  }

  Future<AppSettings?> getSettings() async {
    final doc = await _settingsRef.get();
    if (doc.exists) {
      final data = doc.data() as Map<String, dynamic>;
      if (data.containsKey('settings')) {
        return AppSettings.fromMap(data['settings']);
      }
    }
    return null;
  }

  // Fetch a specific day log
  Future<DayLog?> getDayLog(String date) async {
    final doc = await _logsRef.doc(date).get();
    if (doc.exists) {
      return DayLog.fromMap(doc.data() as Map<String, dynamic>);
    }
    return null;
  }

  // Upload photos to Storage and return URLs
  Future<List<String>> uploadImages(List<File> files, String folder) async {
    List<String> urls = [];
    for (var file in files) {
      try {
        final fileName = '${DateTime.now().millisecondsSinceEpoch}_${file.path.split('/').last}';
        final ref = _storage.ref().child('users/$uid/$folder/$fileName');
        await ref.putFile(file);
        final url = await ref.getDownloadURL();
        urls.add(url);
      } catch (e) {
        print('Erro no upload: $e');
      }
    }
    return urls;
  }

  String _formatDate(DateTime date) {
    return "${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}";
  }
}
