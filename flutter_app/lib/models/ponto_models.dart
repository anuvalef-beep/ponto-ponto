import 'package:cloud_firestore/cloud_firestore.dart';

enum PunchType { entrada, pausa, retorno, fim }

class Punch {
  final String id;
  final PunchType type;
  final DateTime timestamp;
  final String carPrefix;

  Punch({
    required this.id,
    required this.type,
    required this.timestamp,
    required this.carPrefix,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'type': type.name,
      'timestamp': timestamp.millisecondsSinceEpoch,
      'carPrefix': carPrefix,
    };
  }

  factory Punch.fromMap(Map<String, dynamic> map) {
    return Punch(
      id: map['id'],
      type: PunchType.values.byName(map['type']),
      timestamp: DateTime.fromMillisecondsSinceEpoch(map['timestamp']),
      carPrefix: map['carPrefix'],
    );
  }
}

class DayLog {
  final String date; // YYYY-MM-DD
  final String carPrefix;
  final List<Punch> punches;
  final bool isDayOff;

  DayLog({
    required this.date,
    required this.carPrefix,
    required this.punches,
    this.isDayOff = false,
  });

  Map<String, dynamic> toMap() {
    return {
      'date': date,
      'carPrefix': carPrefix,
      'punches': punches.map((p) => p.toMap()).toList(),
      'isDayOff': isDayOff,
    };
  }

  factory DayLog.fromMap(Map<String, dynamic> map) {
    return DayLog(
      date: map['date'],
      carPrefix: map['carPrefix'],
      punches: (map['punches'] as List).map((p) => Punch.fromMap(p)).toList(),
      isDayOff: map['isDayOff'] ?? false,
    );
  }
}
