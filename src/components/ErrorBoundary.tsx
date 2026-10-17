import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { ShieldAlert, RefreshCw } from 'lucide-react-native';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../constants/theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });
    console.error('[Trivora ErrorBoundary caught error]:', error, errorInfo);
  }

  handleRestart = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || 'Unknown runtime error';
      const componentStack = this.state.errorInfo?.componentStack || '';

      return (
        <SafeAreaView style={styles.safeArea}>
          <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <ShieldAlert size={36} color="#DC2626" />
              </View>
              <Text style={styles.title}>Something went wrong</Text>
              <Text style={styles.subtitle}>
                Trivora Driver safely intercepted an issue. Tap restart to recover.
              </Text>
            </View>

            <ScrollView style={styles.detailsBox} contentContainerStyle={styles.detailsContent}>
              <Text style={styles.errorLabel}>Diagnostic Information:</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
              {componentStack ? (
                <Text style={styles.stackText}>{componentStack.trim()}</Text>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.restartButton}
                activeOpacity={0.8}
                onPress={this.handleRestart}
              >
                <RefreshCw size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.restartButtonText}>Restart Trivora Driver</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: SPACING.md,
  },
  detailsBox: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: RADIUS.lg,
    marginVertical: SPACING.xl,
  },
  detailsContent: {
    padding: SPACING.md,
  },
  errorLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  errorText: {
    fontSize: 13,
    color: '#F87171',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  stackText: {
    fontSize: 11,
    color: '#94A3B8',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  footer: {
    marginBottom: SPACING.md,
  },
  restartButton: {
    height: 52,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restartButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
