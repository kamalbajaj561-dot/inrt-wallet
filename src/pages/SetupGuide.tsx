import React from 'react';
import { Card, Button } from '@/components/ui';
import { Settings } from 'lucide-react';

export default function SetupGuide() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-500">
            <Settings size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Setup Required</h1>
          <p className="text-slate-500 mt-2">Connect Firebase to start using INRT Wallet</p>
        </div>

        <div className="space-y-4 text-sm text-slate-600">
          <p>This application requires a Firebase project for Authentication and Database.</p>
          
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-2">Steps to Configure:</h3>
            <ol className="list-decimal list-inside space-y-2">
              <li>Create a project at <a href="https://console.firebase.google.com" target="_blank" className="text-primary underline">console.firebase.google.com</a></li>
              <li>Enable <strong>Authentication</strong> (Phone Sign-in)</li>
              <li>Enable <strong>Firestore Database</strong></li>
              <li>Go to <strong>Authentication {'>'} Settings {'>'} Authorized Domains</strong></li>
              <li>Add this domain: <code className="bg-slate-200 px-1 rounded select-all">{window.location.hostname}</code></li>
              <li>Go to Project Settings and copy the web app config</li>
              <li>Add the config keys to your environment secrets</li>
            </ol>
          </div>

          <p className="text-xs text-slate-400">
            Note: Phone auth requires adding test phone numbers in Firebase console to work in this preview environment without real SMS.
          </p>
        </div>

        <div className="mt-8">
          <Button onClick={() => window.location.reload()} className="w-full">
            I've Updated the Config
          </Button>
        </div>
      </Card>
    </div>
  );
}
